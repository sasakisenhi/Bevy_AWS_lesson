#[derive(Debug,Clone,Copy)]
pub struct Vec2 {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug)]
pub struct Player {
    pub position: Vec2,
}

impl Player {
    pub fn new(x: f32, y: f32) -> Self {
        Player {
            position: Vec2 { x, y },
        }
    }

    pub fn move_by(&mut self, dx: f32, dy: f32) {
        self.position.x += dx;
        self.position.y += dy;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn player_moves_by_delte() {
        let mut player = Player::new(0.0, 0.0);
        player.move_by(5.0, -3.0);
        assert_eq!(player.position.x, 5.0);
        assert_eq!(player.position.y, -3.0);
    }

    #[test]
    fn movement_is_accumulative() {
    let mut player = Player::new(5.0, 5.0);

        player.move_by(1.0, 0.0);
        player.move_by(0.0, -1.0);
        assert_eq!(player.position.x, 6.0);
        assert_eq!(player.position.y, 4.0);
    }
}
