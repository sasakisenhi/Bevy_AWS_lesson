use bevy::input::ButtonInput;
use bevy::prelude::*;

use game_core::Player;
use game_logic::{Command, apply_command};
use game_runtime::BuildInfo;

fn main() {
    // ビルド情報を表示
    let build_info = BuildInfo::get();
    println!("=== Build Info ===");
    println!("SHA: {}", build_info.git_sha);
    println!("Run ID: {}", build_info.run_id);
    println!("Version: {}", build_info.version);
    println!("==================");

    App::new()
        .add_plugins(DefaultPlugins)
        .add_message::<CommandEvent>() //イベント登録
        .add_systems(Startup, setup)
        .add_systems(Update, handle_input)
        .add_systems(Update, process_commands)
        .add_systems(Update, sync_player_position)
        .run();
}

#[derive(Component)]
struct PlayerComponent {
    player: Player,
}

#[derive(Message)]
struct CommandEvent(Command);

fn setup(mut commands: Commands) {
    // 2D カメラ（これだけでよい）
    commands.spawn(Camera2d);

    // 四角いスプライト
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

//入力取得
fn handle_input(
    keyboard_input: Res<ButtonInput<KeyCode>>,
    mut event_writer: MessageWriter<CommandEvent>,
) {
    if keyboard_input.just_pressed(KeyCode::KeyW) {
        event_writer.write(CommandEvent(Command::MoveUp));
    }
    if keyboard_input.just_pressed(KeyCode::KeyS) {
        event_writer.write(CommandEvent(Command::MoveDown));
    }
    if keyboard_input.just_pressed(KeyCode::KeyA) {
        event_writer.write(CommandEvent(Command::MoveLeft));
    }
    if keyboard_input.just_pressed(KeyCode::KeyD) {
        event_writer.write(CommandEvent(Command::MoveRight));
    }
}

//コマンド処理
fn process_commands(
    mut event_reader: MessageReader<CommandEvent>,
    mut query: Query<&mut PlayerComponent>,
) {
    for event in event_reader.read() {
        for mut pc in &mut query {
            apply_command(&mut pc.player, event.0.clone());
        }
    }
}

fn sync_player_position(mut query: Query<(&PlayerComponent, &mut Transform)>) {
    for (player, mut transform) in &mut query {
        transform.translation.x = player.player.position.x;
        transform.translation.y = player.player.position.y;
    }
}
