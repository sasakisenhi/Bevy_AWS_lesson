//! Runtime モジュール
//! ゲームランタイムの実装とビルド情報を提供する

// ビルド時に生成されたビルド情報を埋め込む
include!(concat!(env!("OUT_DIR"), "/build_info.rs"));
