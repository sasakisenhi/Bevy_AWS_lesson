use std::time::Duration;

use bevy::{
    diagnostic::{DiagnosticsStore, FrameTimeDiagnosticsPlugin},
    prelude::*,
    time::common_conditions::on_real_timer,
};

/// 開発中だけ有効にする共通Dev Mode。
/// 2D/3Dやジャンル固有の機能は、このPluginに直接詰め込まず別Pluginとして足す。
pub struct DevModePlugin;

impl Plugin for DevModePlugin {
    fn build(&self, app: &mut App) {
        if !app.is_plugin_added::<FrameTimeDiagnosticsPlugin>() {
            app.add_plugins(FrameTimeDiagnosticsPlugin::default());
        }

        app.init_resource::<DevModeState>()
            .init_resource::<DevModeInfo>()
            .add_message::<DevResetRequested>()
            .add_systems(Startup, spawn_dev_hud)
            .add_systems(
                Update,
                (
                    handle_dev_hotkeys,
                    update_dev_hud.run_if(on_real_timer(Duration::from_millis(100))),
                ),
            );
    }
}

/// HUDとホットキーが共有する、開発モードの最小状態。
#[derive(Debug, Resource)]
pub struct DevModeState {
    pub hud_visible: bool,
    pub slow_motion: bool,
    pub reset_requests: u64,
}

impl Default for DevModeState {
    fn default() -> Self {
        Self {
            hud_visible: true,
            slow_motion: false,
            reset_requests: 0,
        }
    }
}

/// Runtime側がHUDに出したい現在の確認対象。
#[derive(Debug, Resource)]
pub struct DevModeInfo {
    pub scene: String,
    pub focus: String,
}

impl DevModeInfo {
    pub fn new(scene: impl Into<String>, focus: impl Into<String>) -> Self {
        Self {
            scene: scene.into(),
            focus: focus.into(),
        }
    }
}

impl Default for DevModeInfo {
    fn default() -> Self {
        Self::new("unknown", "none")
    }
}

/// Devtoolsからruntimeへ、現在の確認状態を作り直してほしいと伝える要求。
/// 実際に何をリセットするかは各runtimeが決める。
#[derive(Debug, Clone, Copy, Message)]
pub struct DevResetRequested;

#[derive(Component)]
struct DevHudRoot;

#[derive(Component)]
struct DevHudText;

fn spawn_dev_hud(mut commands: Commands) {
    commands
        .spawn((
            Node {
                position_type: PositionType::Absolute,
                top: px(12),
                left: px(12),
                padding: UiRect::all(px(10)),
                max_width: px(420),
                border_radius: BorderRadius::all(px(4)),
                ..default()
            },
            BackgroundColor(Color::srgba(0.02, 0.02, 0.025, 0.82)),
            GlobalZIndex(i32::MAX),
            Visibility::Visible,
            DevHudRoot,
        ))
        .with_child((
            Text::default(),
            TextFont {
                font_size: 14.0,
                ..default()
            },
            TextColor(Color::srgb(0.88, 0.94, 1.0)),
            DevHudText,
        ));
}

fn handle_dev_hotkeys(
    keyboard: Res<ButtonInput<KeyCode>>,
    mut state: ResMut<DevModeState>,
    mut virtual_time: ResMut<Time<Virtual>>,
    mut reset_writer: MessageWriter<DevResetRequested>,
) {
    if keyboard.just_pressed(KeyCode::F1) {
        state.hud_visible = !state.hud_visible;
    }

    if keyboard.just_pressed(KeyCode::F5) {
        state.reset_requests += 1;
        reset_writer.write(DevResetRequested);
    }

    if keyboard.just_pressed(KeyCode::F9) {
        if virtual_time.is_paused() {
            virtual_time.unpause();
        } else {
            virtual_time.pause();
        }
    }

    if keyboard.just_pressed(KeyCode::F10) {
        state.slow_motion = !state.slow_motion;
        virtual_time.set_relative_speed(if state.slow_motion { 0.25 } else { 1.0 });
    }
}

fn update_dev_hud(
    state: Res<DevModeState>,
    info: Res<DevModeInfo>,
    diagnostics: Res<DiagnosticsStore>,
    virtual_time: Res<Time<Virtual>>,
    mut roots: Query<&mut Visibility, With<DevHudRoot>>,
    mut texts: Query<&mut Text, With<DevHudText>>,
) {
    for mut visibility in &mut roots {
        *visibility = if state.hud_visible {
            Visibility::Visible
        } else {
            Visibility::Hidden
        };
    }

    if !state.hud_visible {
        return;
    }

    let fps = smoothed_diagnostic(&diagnostics, &FrameTimeDiagnosticsPlugin::FPS);
    let frame_time_ms = smoothed_diagnostic(&diagnostics, &FrameTimeDiagnosticsPlugin::FRAME_TIME);
    let time_mode = if virtual_time.is_paused() {
        "paused".to_string()
    } else {
        format!("{:.2}x", virtual_time.relative_speed())
    };

    for mut text in &mut texts {
        **text = format!(
            "DEV MODE\n\
             scene: {}\n\
             focus: {}\n\
             fps: {}  frame: {} ms\n\
             time: {}  resets: {}\n\
             F1 hud  F5 reset  F9 pause  F10 slow",
            info.scene, info.focus, fps, frame_time_ms, time_mode, state.reset_requests
        );
    }
}

fn smoothed_diagnostic(
    diagnostics: &DiagnosticsStore,
    path: &bevy::diagnostic::DiagnosticPath,
) -> String {
    diagnostics
        .get(path)
        .and_then(|diagnostic| diagnostic.smoothed())
        .map(|value| format!("{value:.1}"))
        .unwrap_or_else(|| "--".to_string())
}

#[cfg(test)]
mod tests {
    use bevy::{ecs::message::Messages, prelude::*};

    use super::*;

    #[test]
    fn dev_mode_state_defaults_to_visible_running_hud() {
        let state = DevModeState::default();

        assert!(state.hud_visible);
        assert!(!state.slow_motion);
        assert_eq!(state.reset_requests, 0);
    }

    #[test]
    fn dev_mode_info_can_name_scene_and_focus() {
        let info = DevModeInfo::new("battle_test", "player_spawn");

        assert_eq!(info.scene, "battle_test");
        assert_eq!(info.focus, "player_spawn");
    }

    #[test]
    fn dev_mode_info_default_is_explicitly_unknown() {
        let info = DevModeInfo::default();

        assert_eq!(info.scene, "unknown");
        assert_eq!(info.focus, "none");
    }

    #[test]
    fn dev_mode_plugin_initializes_resources_and_hud() {
        let mut app = App::new();
        app.add_plugins(MinimalPlugins)
            .init_resource::<ButtonInput<KeyCode>>()
            .add_plugins(DevModePlugin);

        assert!(app.world().contains_resource::<DevModeState>());
        assert!(app.world().contains_resource::<DevModeInfo>());
        assert!(
            app.world()
                .contains_resource::<Messages<DevResetRequested>>()
        );

        app.update();

        let root_count = app
            .world_mut()
            .query::<&DevHudRoot>()
            .iter(app.world())
            .count();
        let text_count = app
            .world_mut()
            .query::<&DevHudText>()
            .iter(app.world())
            .count();

        assert_eq!(root_count, 1);
        assert_eq!(text_count, 1);
    }

    #[test]
    fn f1_toggles_hud_visibility_state() {
        let mut app = hotkey_app();

        press_key(&mut app, KeyCode::F1);
        app.update();

        assert!(!app.world().resource::<DevModeState>().hud_visible);
    }

    #[test]
    fn f5_requests_reset_and_counts_it() {
        let mut app = hotkey_app();

        press_key(&mut app, KeyCode::F5);
        app.update();

        assert_eq!(app.world().resource::<DevModeState>().reset_requests, 1);
        assert_eq!(
            app.world()
                .resource::<Messages<DevResetRequested>>()
                .iter_current_update_messages()
                .count(),
            1
        );
    }

    #[test]
    fn f9_toggles_virtual_time_pause() {
        let mut app = hotkey_app();

        press_key(&mut app, KeyCode::F9);
        app.update();

        assert!(app.world().resource::<Time<Virtual>>().is_paused());
    }

    #[test]
    fn f10_toggles_slow_motion() {
        let mut app = hotkey_app();

        press_key(&mut app, KeyCode::F10);
        app.update();

        let state = app.world().resource::<DevModeState>();
        let time = app.world().resource::<Time<Virtual>>();
        assert!(state.slow_motion);
        assert_eq!(time.relative_speed(), 0.25);
    }

    fn hotkey_app() -> App {
        let mut app = App::new();
        app.init_resource::<ButtonInput<KeyCode>>()
            .init_resource::<DevModeState>()
            .init_resource::<Time<Virtual>>()
            .add_message::<DevResetRequested>()
            .add_systems(Update, handle_dev_hotkeys);
        app
    }

    fn press_key(app: &mut App, key_code: KeyCode) {
        app.world_mut()
            .resource_mut::<ButtonInput<KeyCode>>()
            .press(key_code);
    }
}
