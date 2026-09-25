# 当番表・グループ分け

公開 URL: **https://yorozu-craft.com/toban/**（当番表）、**https://yorozu-craft.com/toban/group/**（グループ分け）、**https://yorozu-craft.com/toban/en/**（Random Group Generator。英語版）

当番表のローテーションと、条件つきのグループ分け（班分け）を作って印刷。
yorozu-craft のツールの1つです（共通ルールは [youheioonuki.github.io の README](https://github.com/YouheiOonuki/youheioonuki.github.io) を参照）。企画書は yorozu-plans の `docs/22_当番表.md`（K74）。

## 機能

- **当番表**（`/toban/`）: 担当する人（班でも）× 当番の種類（「給食 2」で 1 回 2 人）× 期間。日ごと／週ごと（月曜はじまり）、曜日、祝日を除く、担当できない日（日付・曜日）。回し方は「名簿の順に回す」と「くじ」。どちらも回数の差を最小にし、なるべく続けて当番にしない。A4 縦で印刷（1 人ずつの回数の表つき）
- **グループ分け**（`/toban/group/`・`/toban/en/`）: 名簿の貼り付け（「,男」「,女」「★」）か番号だけ、班の数か 1 班の人数。条件は 男女の数をそろえる・★の人をそろえる・別の班にする人（1 行 1 組、何人でも）・同じ班にする人・前回と同じ班だった人をなるべく別に。守れない条件は名前で知らせる。「この班で決定」で記録（10 件）。A4 縦で印刷。「この班で当番表を作る」で 1班〜N班を当番表へ
- くじ番号（seed）: 同じ番号・同じ入力なら同じ結果（`Math.random` を使わない）
- 共有リンク `#s=`: 既定は名前を入れない（番号で出る）。受け取った画面は「この端末に保存する」まで端末のデータを書きかえない
- 入力内容はこの端末のブラウザにだけ保存し、外部には送信しない。ファイルへの書き出し・読み込み（当番表と班分けの両方）

## 決め方の仕様

- **当番表**（`calc.js` の `makeRoster`）: 1 行（日・週）ずつ、その行の枠（当番 × 人数）と人を割り当て問題（ハンガリー法、`assignMin`）で結ぶ。コストの重い順に 1) それまでの回数 2) すぐ前の行にも当番だったか 3) その当番の回数 4) 順番（前の当番の次・名簿の順）かくじの乱数。担当できない人はその行に入れない。人が足りない枠は空ける（「—」）
- **グループ分け**（`makeGroups`）: 「同じ班」の人をまとまりにし、大きいまとまりから（同じ属性の割合が低い）空きのある班へ入れる → まとまりの入れ替え・移動をくじで試す焼きなまし。守れない条件（人数・別の班・男女と★の差 2 以上）を先に、前回と同じ班だった 2 人の組をあとで減らす。試す回数は人数で決まっていて、時間では打ち切らない
- 画面の文は `text.js`（`TEXT.ja`・`TEXT.en`・`TEXT.duty`）。`calc.js` は `{ code }` を返す

## 値と出典

| 値 | 出典 | 確認日 |
|---|---|---|
| 祝日（2025〜2027 年の 54 日。振替休日・国民の休日を含む） | 内閣府「国民の祝日」について <https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html> の CSV（syukujitsu.csv） | 2026-09-25（`constants.js` の `CHECKED`） |

## 保守

| 時期 | 確認すること | 直す場所 |
|------|------------|---------|
| 毎年 2 月ごろ | 内閣府が翌年の祝日を公表したら CSV から足す（今は 2027 年まで。2027 年 2 月に 2028 年を足す） | `constants.js` の `HOLIDAYS`・`HOLIDAY_YEARS.to`・`CHECKED`、テストの日数、`guide.html` の確認日と更新履歴 |

値や決め方を直したら、`guide.html` の「更新履歴」に日付と内容を 1 行足す。`sw.js` のキャッシュ名（`toban-vN`）は、キャッシュするファイルの構成を変えたら上げる。

## ファイル

| ファイル | 役割 |
|---------|------|
| `index.html` / `main.js` | 当番表 |
| `group/index.html` / `en/index.html` / `group.js` | グループ分け（日本語・英語。`group.js` は `<html lang>` で文を選ぶ） |
| `guide.html` | 使い方・決め方のしくみ・よくある質問・ご利用上の注意・更新履歴 |
| `print/index.html` | 印刷物のクレジットの着地ページ（noindex・sitemap に載せない） |
| `calc.js` | 決め方（画面から切り離した純粋関数）・共有リンク・正規化・バックアップ |
| `text.js` | 画面に出す文 |
| `constants.js` | 祝日（値・出典・確認日） |
| `screen.js` | 画面の部品（上端の固定バー、`details` の `summary` の状態表示） |
| `style.css` | 見た目（和紙風の配色、ダークモード、印刷） |
| `sw.js` / `manifest.webmanifest` | オフライン対応（キャッシュ名 `toban-v1`） |
| `404.html` | ツール配下の存在しない URL で出るページ（サイト共通のもの） |
| `favicon.svg` / `apple-touch-icon.png` / `og-image.png` | アイコン / ホーム画面用アイコン / SNS 共有用画像（1200×630） |
| `sitemap.xml` | サイトマップ（robots.txt はドメイン直下で管理） |
| `tests/*.test.js` | テスト（`node --test tests/*.test.js`。`.github/workflows/test.yml` で push・PR のたびに自動実行） |

保存キー: `toban_duty`（当番表）、`toban_group`（班分け・記録）。

## ライセンス

MIT License（`LICENSE`）。
