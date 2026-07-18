# 2015_thesis

2015年度卒業論文『建築デザインとコンピューター発展の関係 ─『建築雑誌』の記事分析を通して』の関連リポジトリ。

## docs/ ─ 建築CAD/CGソフトウェア系譜 3Dネットワーク

`docs/` 以下は、卒論の資料編「現代における代表的CAD,CGソフトウェア」をもとに構成した、CAD/CGソフトウェア28本・開発企業/組織29・プラグイン3の関係を辿れる3Dネットワーク可視化。発光する粒子とフィラメントによる表現で、タイムラインを動かすと買収・提携によって業界が再編されていく様子を再生できる。

three.js + [3d-force-graph](https://github.com/vasturiano/3d-force-graph)（force layout）+ UnrealBloomPass（発光表現）を使用。

### ローカルで見る

ビルド済みバンドル（`docs/app.js`）を含んでいるので、`docs/` を静的サーバーで配信するだけで動く。

```sh
cd docs
python3 -m http.server 8000
# http://localhost:8000 を開く
```

### 開発（ソースを変更する場合）

可視化のソースは `src/app.js`。esbuild で `docs/app.js` にバンドルする。

```sh
npm install 3d-force-graph three three-spritetext esbuild
npx esbuild src/app.js --bundle --minify --format=iife --outfile=docs/app.js
```

### 構成

```
src/
└── app.js               # 可視化ソース（グラフ描画・タイムライン・フィルタ・詳細パネル）
docs/
├── index.html           # エントリーポイント
├── style.css
├── app.js               # esbuildでバンドルした配信用JS（three.js等を含む）
└── data/
    └── software-graph.json   # ソフトウェア/企業/プラグインのノード・リンクデータ
```

データはすべて卒論資料編のテキストから手作業で構造化したもの。年表・買収関係のうち、原文に明記のない年（例：UGS社が現Siemens PLM Softwareへ移行した正確な時期）は個別のリンクとして持たせず、単一の組織として連続的に扱っている。
