use bevy::prelude::*;
use game_core::Player;
use bevy::input::ButtonInput;
use game_logic::{Command,apply_command};

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_systems(Startup, setup)
        .add_systems(Update,sync_player_position)
        .add_systems(Update, handle_input)
        .run();
}
#[derive(Component)]
pub struct PlayerComponent {
    pub player: Player,
}

fn setup(mut commands: Commands) {
    commands.spawn((
        Camera2d,
        Transform::from_xyz(0.0, 0.0, 1000.0),
    ));

    commands.spawn((
        Sprite {
            color: Color::srgb(0.2, 0.7, 0.9),
            custom_size: Some(Vec2::new(100.0, 100.0)),
            ..default()
        },
       Transform::from_xyz(0.0, 0.0, 0.0),
        PlayerComponent {
            player: Player {
                position: game_core::Vec2 { x: 0.0, y: 0.0 },
            },
        },
    ));
}

fn handle_input(
    keybord_input: Res<ButtonInput<KeyCode>>,
    mut query: Query<&mut PlayerComponent>,
) {
    for mut pc in query.iter_mut() {
        if keybord_input.just_pressed(KeyCode::KeyW) {
            apply_command(&mut pc.player, Command::MoveUp);
        }
        if keybord_input.just_pressed(KeyCode::KeyS) {
            apply_command(&mut pc.player, Command::MoveDown);
        }
        if keybord_input.just_pressed(KeyCode::KeyA) {
            apply_command(&mut pc.player, Command::MoveLeft);
        }
        if keybord_input.just_pressed(KeyCode::KeyD) {
            apply_command(&mut pc.player, Command::MoveRight);
        }
    }
}

fn sync_player_position(
    mut query: Query<(&PlayerComponent, &mut Transform)>,
    ) {
        for (player, mut transform) in query.iter_mut() {
            transform.translation.x = player.player.position.x;
            transform.translation.y = player.player.position.y;
        }
    }