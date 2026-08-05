/*
 * LazyMotion に遅延ロードさせるアニメーション機能。
 * 動的importの対象を専用モジュールにしておかないと、App が静的importする
 * motion/react のバレルと同じモジュールを指してしまい、初期チャンクへ混ざる。
 */
export { domAnimation as default } from "motion/react";
