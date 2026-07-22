use std::{
    collections::HashSet,
    fmt, fs,
    path::{Path, PathBuf},
};

use bevy::prelude::*;
use serde::Deserialize;

/// ゲーム固有の状態を持たず、Fixtureの選択と実行要求だけを担う。
pub struct DevScenarioPlugin {
    initial_state: DevScenarioState,
}

impl DevScenarioPlugin {
    pub fn from_ron_path(path: impl AsRef<Path>) -> Self {
        let initial_state = match load_catalog(path.as_ref()) {
            Ok(scenarios) => DevScenarioState::new(scenarios),
            Err(error) => DevScenarioState::from_catalog_error(error),
        };

        Self { initial_state }
    }

    pub fn with_scenarios(scenarios: impl IntoIterator<Item = DevScenario>) -> Self {
        Self {
            initial_state: DevScenarioState::new(scenarios.into_iter().collect()),
        }
    }
}

impl Plugin for DevScenarioPlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(self.initial_state.clone())
            .add_message::<DevScenarioRunRequested>()
            .add_message::<DevScenarioRunResult>()
            .add_systems(Update, (handle_scenario_hotkeys, record_scenario_results));
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct DevScenarioId(String);

impl DevScenarioId {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for DevScenarioId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(formatter)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DevScenario {
    id: DevScenarioId,
    label: String,
    fixture_path: PathBuf,
}

impl DevScenario {
    pub fn new(
        id: impl Into<String>,
        label: impl Into<String>,
        fixture_path: impl Into<PathBuf>,
    ) -> Self {
        Self {
            id: DevScenarioId::new(id),
            label: label.into(),
            fixture_path: fixture_path.into(),
        }
    }

    pub fn id(&self) -> &DevScenarioId {
        &self.id
    }

    pub fn label(&self) -> &str {
        &self.label
    }

    pub fn fixture_path(&self) -> &Path {
        &self.fixture_path
    }
}

#[derive(Debug, Clone, Resource)]
pub struct DevScenarioState {
    scenarios: Vec<DevScenario>,
    selected_index: usize,
    run_count: u64,
    last_run: Option<DevScenarioId>,
    status: ScenarioRunStatus,
    catalog_error: Option<String>,
}

impl DevScenarioState {
    fn new(scenarios: Vec<DevScenario>) -> Self {
        Self {
            scenarios,
            selected_index: 0,
            run_count: 0,
            last_run: None,
            status: ScenarioRunStatus::Ready,
            catalog_error: None,
        }
    }

    fn from_catalog_error(error: String) -> Self {
        let mut state = Self::new(Vec::new());
        state.catalog_error = Some(error);
        state
    }

    pub fn selected(&self) -> Option<&DevScenario> {
        self.scenarios.get(self.selected_index)
    }

    pub fn scenario_count(&self) -> usize {
        self.scenarios.len()
    }

    pub fn scenarios(&self) -> &[DevScenario] {
        &self.scenarios
    }

    pub fn run_count(&self) -> u64 {
        self.run_count
    }

    pub fn last_run(&self) -> Option<&DevScenarioId> {
        self.last_run.as_ref()
    }

    pub fn catalog_error(&self) -> Option<&str> {
        self.catalog_error.as_deref()
    }

    pub(crate) fn hud_text(&self) -> String {
        let Some(selected) = self.selected() else {
            let detail = self.catalog_error.as_deref().unwrap_or("catalog is empty");
            return format!("scenario: unavailable ({detail})\n");
        };

        format!(
            "scenario: {}/{} {}\n\
             scenario status: {}  runs: {}\n\
             F6 prev  F7 next  F8 run\n",
            self.selected_index + 1,
            self.scenarios.len(),
            selected.label(),
            self.status.text(),
            self.run_count
        )
    }

    fn select_next(&mut self) {
        if !self.scenarios.is_empty() {
            self.selected_index = (self.selected_index + 1) % self.scenarios.len();
        }
    }

    fn select_previous(&mut self) {
        if !self.scenarios.is_empty() {
            self.selected_index =
                (self.selected_index + self.scenarios.len() - 1) % self.scenarios.len();
        }
    }

    fn request_selected(&mut self) -> Option<DevScenario> {
        let scenario = self.selected()?.clone();
        self.status = ScenarioRunStatus::Requested(scenario.id().clone());
        Some(scenario)
    }

    fn record_result(&mut self, result: DevScenarioRunResult) {
        match result.outcome {
            ScenarioRunOutcome::Succeeded => {
                self.run_count += 1;
                self.last_run = Some(result.scenario_id.clone());
                self.status = ScenarioRunStatus::Succeeded(result.scenario_id);
            }
            ScenarioRunOutcome::Failed(error) => {
                self.status = ScenarioRunStatus::Failed(result.scenario_id, error);
            }
        }
    }
}

#[derive(Debug, Clone)]
enum ScenarioRunStatus {
    Ready,
    Requested(DevScenarioId),
    Succeeded(DevScenarioId),
    Failed(DevScenarioId, String),
}

impl ScenarioRunStatus {
    fn text(&self) -> String {
        match self {
            Self::Ready => "ready".to_string(),
            Self::Requested(id) => format!("loading {id}"),
            Self::Succeeded(id) => format!("loaded {id}"),
            Self::Failed(id, error) => format!("failed {id}: {error}"),
        }
    }
}

#[derive(Debug, Clone, Message)]
pub struct DevScenarioRunRequested {
    scenario: DevScenario,
}

impl DevScenarioRunRequested {
    pub fn new(scenario: DevScenario) -> Self {
        Self { scenario }
    }

    pub fn scenario(&self) -> &DevScenario {
        &self.scenario
    }
}

#[derive(Debug, Clone, Message)]
pub struct DevScenarioRunResult {
    scenario_id: DevScenarioId,
    outcome: ScenarioRunOutcome,
}

impl DevScenarioRunResult {
    pub fn succeeded(scenario_id: DevScenarioId) -> Self {
        Self {
            scenario_id,
            outcome: ScenarioRunOutcome::Succeeded,
        }
    }

    pub fn failed(scenario_id: DevScenarioId, error: impl Into<String>) -> Self {
        Self {
            scenario_id,
            outcome: ScenarioRunOutcome::Failed(error.into()),
        }
    }
}

#[derive(Debug, Clone)]
enum ScenarioRunOutcome {
    Succeeded,
    Failed(String),
}

fn handle_scenario_hotkeys(
    keyboard: Res<ButtonInput<KeyCode>>,
    mut state: ResMut<DevScenarioState>,
    mut requests: MessageWriter<DevScenarioRunRequested>,
) {
    if keyboard.just_pressed(KeyCode::F6) {
        state.select_previous();
    }

    if keyboard.just_pressed(KeyCode::F7) {
        state.select_next();
    }

    if keyboard.just_pressed(KeyCode::F8)
        && let Some(scenario) = state.request_selected()
    {
        requests.write(DevScenarioRunRequested::new(scenario));
    }
}

fn record_scenario_results(
    mut results: MessageReader<DevScenarioRunResult>,
    mut state: ResMut<DevScenarioState>,
) {
    for result in results.read() {
        state.record_result(result.clone());
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ScenarioCatalogFile {
    scenarios: Vec<ScenarioCatalogEntry>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ScenarioCatalogEntry {
    id: String,
    label: String,
    fixture: PathBuf,
}

fn load_catalog(path: &Path) -> Result<Vec<DevScenario>, String> {
    let source = fs::read_to_string(path)
        .map_err(|error| format!("could not read {}: {error}", path.display()))?;
    let base_directory = path.parent().unwrap_or_else(|| Path::new("."));
    parse_catalog(&source, base_directory)
        .map_err(|error| format!("invalid {}: {error}", path.display()))
}

fn parse_catalog(source: &str, base_directory: &Path) -> Result<Vec<DevScenario>, String> {
    let catalog: ScenarioCatalogFile = ron::from_str(source).map_err(|error| error.to_string())?;
    let mut ids = HashSet::new();
    let mut scenarios = Vec::with_capacity(catalog.scenarios.len());

    for entry in catalog.scenarios {
        if entry.id.trim().is_empty() {
            return Err("scenario id must not be empty".to_string());
        }
        if entry.label.trim().is_empty() {
            return Err(format!("scenario {} has an empty label", entry.id));
        }
        if !ids.insert(entry.id.clone()) {
            return Err(format!("duplicate scenario id: {}", entry.id));
        }

        let fixture_path = if entry.fixture.is_absolute() {
            entry.fixture
        } else {
            base_directory.join(entry.fixture)
        };
        scenarios.push(DevScenario::new(entry.id, entry.label, fixture_path));
    }

    Ok(scenarios)
}

#[cfg(test)]
mod tests {
    use bevy::ecs::message::Messages;

    use super::*;

    #[test]
    fn catalog_resolves_fixture_paths_relative_to_itself() {
        let scenarios = parse_catalog(
            r#"(
                scenarios: [
                    (id: "spawn.origin", label: "Spawn Origin", fixture: "fixtures/origin.ron"),
                ],
            )"#,
            Path::new("/game/assets/dev"),
        )
        .unwrap();

        assert_eq!(scenarios[0].id().as_str(), "spawn.origin");
        assert_eq!(scenarios[0].label(), "Spawn Origin");
        assert_eq!(
            scenarios[0].fixture_path(),
            Path::new("/game/assets/dev/fixtures/origin.ron")
        );
    }

    #[test]
    fn catalog_rejects_duplicate_ids() {
        let error = parse_catalog(
            r#"(
                scenarios: [
                    (id: "same", label: "First", fixture: "first.ron"),
                    (id: "same", label: "Second", fixture: "second.ron"),
                ],
            )"#,
            Path::new("."),
        )
        .unwrap_err();

        assert_eq!(error, "duplicate scenario id: same");
    }

    #[test]
    fn selection_wraps_in_both_directions() {
        let mut state = DevScenarioState::new(sample_scenarios());

        state.select_previous();
        assert_eq!(state.selected().unwrap().id().as_str(), "third");

        state.select_next();
        assert_eq!(state.selected().unwrap().id().as_str(), "first");
    }

    #[test]
    fn empty_catalog_ignores_selection_and_run() {
        let mut state = DevScenarioState::new(Vec::new());

        state.select_previous();
        state.select_next();

        assert!(state.selected().is_none());
        assert!(state.request_selected().is_none());
    }

    #[test]
    fn f7_selects_next_scenario() {
        let mut app = scenario_app();

        press_key(&mut app, KeyCode::F7);
        app.update();

        assert_eq!(
            app.world()
                .resource::<DevScenarioState>()
                .selected()
                .unwrap()
                .id()
                .as_str(),
            "second"
        );
    }

    #[test]
    fn f6_selects_previous_scenario() {
        let mut app = scenario_app();

        press_key(&mut app, KeyCode::F6);
        app.update();

        assert_eq!(
            app.world()
                .resource::<DevScenarioState>()
                .selected()
                .unwrap()
                .id()
                .as_str(),
            "third"
        );
    }

    #[test]
    fn f8_requests_selected_scenario() {
        let mut app = scenario_app();

        press_key(&mut app, KeyCode::F8);
        app.update();

        let messages = app.world().resource::<Messages<DevScenarioRunRequested>>();
        let request = messages.iter_current_update_messages().next().unwrap();
        assert_eq!(request.scenario().id().as_str(), "first");
    }

    #[test]
    fn successful_result_records_last_run() {
        let mut state = DevScenarioState::new(sample_scenarios());

        state.record_result(DevScenarioRunResult::succeeded(DevScenarioId::new(
            "second",
        )));

        assert_eq!(state.run_count(), 1);
        assert_eq!(state.last_run().unwrap().as_str(), "second");
    }

    #[test]
    fn failed_result_does_not_count_as_run() {
        let mut state = DevScenarioState::new(sample_scenarios());

        state.record_result(DevScenarioRunResult::failed(
            DevScenarioId::new("second"),
            "fixture is invalid",
        ));

        assert_eq!(state.run_count(), 0);
        assert!(state.last_run().is_none());
        assert!(state.status.text().contains("fixture is invalid"));
    }

    fn scenario_app() -> App {
        let mut app = App::new();
        app.init_resource::<ButtonInput<KeyCode>>()
            .add_plugins(DevScenarioPlugin::with_scenarios(sample_scenarios()));
        app
    }

    fn sample_scenarios() -> Vec<DevScenario> {
        ["first", "second", "third"]
            .into_iter()
            .map(|id| DevScenario::new(id, id, format!("{id}.ron")))
            .collect()
    }

    fn press_key(app: &mut App, key_code: KeyCode) {
        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .press(key_code);
    }
}
