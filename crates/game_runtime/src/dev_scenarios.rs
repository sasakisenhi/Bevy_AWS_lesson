use std::{fs, path::PathBuf};

use bevy::prelude::*;
use game_core::Player;
use game_devtools::{
    DevModeInfo, DevResetRequested, DevScenario, DevScenarioRunRequested, DevScenarioRunResult,
};
use serde::Deserialize;

use super::PlayerComponent;

pub(super) struct PrototypeDevScenarioPlugin;

impl Plugin for PrototypeDevScenarioPlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<ActiveDevScenario>()
            .add_systems(Update, handle_dev_scenario_requests);
    }
}

pub(super) fn catalog_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets/dev/scenarios.ron")
}

#[derive(Default, Resource)]
struct ActiveDevScenario(Option<DevScenario>);

#[derive(Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct PrototypeScenarioFixture {
    player: PlayerFixture,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct PlayerFixture {
    position: PositionFixture,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct PositionFixture {
    x: f32,
    y: f32,
}

fn handle_dev_scenario_requests(
    mut run_requests: MessageReader<DevScenarioRunRequested>,
    mut reset_requests: MessageReader<DevResetRequested>,
    mut results: MessageWriter<DevScenarioRunResult>,
    mut active: ResMut<ActiveDevScenario>,
    mut info: ResMut<DevModeInfo>,
    mut players: Query<(&mut PlayerComponent, &mut Transform)>,
) {
    for request in run_requests.read() {
        run_scenario(
            request.scenario(),
            &mut players,
            &mut active,
            &mut info,
            &mut results,
        );
    }

    if reset_requests.read().count() == 0 {
        return;
    }

    if let Some(scenario) = active.0.clone() {
        run_scenario(
            &scenario,
            &mut players,
            &mut active,
            &mut info,
            &mut results,
        );
    } else if let Err(error) = apply_fixture(&PrototypeScenarioFixture::default(), &mut players) {
        warn!("could not reset default development state: {error}");
    }
}

fn run_scenario(
    scenario: &DevScenario,
    players: &mut Query<(&mut PlayerComponent, &mut Transform)>,
    active: &mut ActiveDevScenario,
    info: &mut DevModeInfo,
    results: &mut MessageWriter<DevScenarioRunResult>,
) {
    let result =
        load_fixture(scenario.fixture_path()).and_then(|fixture| apply_fixture(&fixture, players));

    match result {
        Ok(()) => {
            active.0 = Some(scenario.clone());
            info.scene = scenario.id().to_string();
            info.focus = scenario.label().to_string();
            results.write(DevScenarioRunResult::succeeded(scenario.id().clone()));
        }
        Err(error) => {
            warn!(
                "could not run development scenario {}: {error}",
                scenario.id()
            );
            results.write(DevScenarioRunResult::failed(scenario.id().clone(), error));
        }
    }
}

fn load_fixture(path: &std::path::Path) -> Result<PrototypeScenarioFixture, String> {
    let source = fs::read_to_string(path)
        .map_err(|error| format!("could not read {}: {error}", path.display()))?;
    ron::from_str(&source).map_err(|error| format!("invalid {}: {error}", path.display()))
}

fn apply_fixture(
    fixture: &PrototypeScenarioFixture,
    players: &mut Query<(&mut PlayerComponent, &mut Transform)>,
) -> Result<(), String> {
    let mut applied = false;

    for (mut player, mut transform) in players.iter_mut() {
        player.player = Player::new(fixture.player.position.x, fixture.player.position.y);
        transform.translation.x = fixture.player.position.x;
        transform.translation.y = fixture.player.position.y;
        applied = true;
    }

    if applied {
        Ok(())
    } else {
        Err("player entity was not found".to_string())
    }
}

#[cfg(test)]
mod tests {
    use bevy::ecs::message::Messages;
    use game_devtools::{
        DevScenarioId, DevScenarioPlugin, DevScenarioRunRequested, DevScenarioState,
    };

    use super::*;

    #[test]
    fn fixture_defaults_missing_status_to_origin() {
        let fixture: PrototypeScenarioFixture = ron::from_str("(player: ())").unwrap();

        assert_eq!(fixture.player.position.x, 0.0);
        assert_eq!(fixture.player.position.y, 0.0);
    }

    #[test]
    fn fixture_rejects_unknown_status() {
        let error = ron::from_str::<PrototypeScenarioFixture>(
            "(player: (position: (x: 0.0, y: 0.0), unknown: 1))",
        )
        .unwrap_err();

        assert!(error.to_string().contains("unknown"));
    }

    #[test]
    fn shipped_catalog_and_fixtures_are_valid() {
        let mut app = App::new();
        app.add_plugins(DevScenarioPlugin::from_ron_path(catalog_path()));

        let state = app.world().resource::<DevScenarioState>();
        assert_eq!(state.catalog_error(), None);
        assert_eq!(state.scenario_count(), 3);
        for scenario in state.scenarios() {
            load_fixture(scenario.fixture_path()).unwrap();
        }
    }

    #[test]
    fn run_request_applies_fixture_and_reports_success() {
        let mut app = scenario_app();
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("assets/dev/fixtures/spawn_upper_right.ron");
        let scenario = DevScenario::new("spawn.upper_right", "Upper Right", fixture_path);

        app.world_mut()
            .resource_mut::<Messages<DevScenarioRunRequested>>()
            .write(DevScenarioRunRequested::new(scenario));
        app.update();

        let player = app
            .world_mut()
            .query::<&PlayerComponent>()
            .single(app.world())
            .unwrap();
        assert_eq!(player.player.position.x, 200.0);
        assert_eq!(player.player.position.y, 120.0);

        let results = app.world().resource::<Messages<DevScenarioRunResult>>();
        assert_eq!(results.iter_current_update_messages().count(), 1);
    }

    #[test]
    fn failed_request_preserves_player_and_active_scenario() {
        let mut app = scenario_app();
        app.world_mut().resource_mut::<ActiveDevScenario>().0 =
            Some(DevScenario::new("active", "Active", "active.ron"));
        let missing = DevScenario::new("missing", "Missing", "missing.ron");

        app.world_mut()
            .resource_mut::<Messages<DevScenarioRunRequested>>()
            .write(DevScenarioRunRequested::new(missing));
        app.update();

        let player = app
            .world_mut()
            .query::<&PlayerComponent>()
            .single(app.world())
            .unwrap();
        assert_eq!(player.player.position.x, 10.0);
        assert_eq!(player.player.position.y, 20.0);
        assert_eq!(
            app.world()
                .resource::<ActiveDevScenario>()
                .0
                .as_ref()
                .unwrap()
                .id(),
            &DevScenarioId::new("active")
        );
    }

    #[test]
    fn reset_reloads_last_successful_scenario() {
        let mut app = scenario_app();
        let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("assets/dev/fixtures/spawn_lower_left.ron");
        let scenario = DevScenario::new("spawn.lower_left", "Lower Left", fixture_path);

        app.world_mut()
            .resource_mut::<Messages<DevScenarioRunRequested>>()
            .write(DevScenarioRunRequested::new(scenario));
        app.update();

        {
            let mut player = app
                .world_mut()
                .query::<&mut PlayerComponent>()
                .single_mut(app.world_mut())
                .unwrap();
            player.player = Player::new(999.0, 999.0);
        }
        app.world_mut()
            .resource_mut::<Messages<DevResetRequested>>()
            .write(DevResetRequested);
        app.update();

        let player = app
            .world_mut()
            .query::<&PlayerComponent>()
            .single(app.world())
            .unwrap();
        assert_eq!(player.player.position.x, -200.0);
        assert_eq!(player.player.position.y, -120.0);
    }

    fn scenario_app() -> App {
        let mut app = App::new();
        app.add_message::<DevScenarioRunRequested>()
            .add_message::<DevScenarioRunResult>()
            .add_message::<DevResetRequested>()
            .insert_resource(DevModeInfo::default())
            .add_plugins(PrototypeDevScenarioPlugin);
        app.world_mut().spawn((
            PlayerComponent {
                player: Player::new(10.0, 20.0),
            },
            Transform::from_xyz(10.0, 20.0, 0.0),
        ));
        app
    }
}
