use game_core::Player;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Command {
    MoveUp,
    MoveDown,
    MoveLeft,
    MoveRight,
}

pub fn apply_command(player: &mut Player, command: Command) {
    match command {
        Command::MoveUp => player.move_by(0.0, 1.0),
        Command::MoveDown => player.move_by(0.0, -1.0),
        Command::MoveLeft => player.move_by(-1.0, 0.0),
        Command::MoveRight => player.move_by(1.0, 0.0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use game_core::Player;

    #[test]
    fn command_moves_up_moves_player_up() {
        let mut player = Player::new(0.0, 0.0);

        apply_command(&mut player, Command::MoveUp);

        assert_eq!(player.position.x, 0.0);
        assert_eq!(player.position.y, 1.0);
    }

    #[test]
    fn command_moves_left_moves_player_left() {
        let mut player = Player::new(0.0, 0.0);

        apply_command(&mut player, Command::MoveLeft);

        assert_eq!(player.position.x, -1.0);
        assert_eq!(player.position.y, 0.0);
    }

    //apply_commands_to_playerのテスト
}
