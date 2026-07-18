# 2015_thesis

2015年度卒業論文『建築デザインとコンピューター発展の関係 ─『建築雑誌』の記事分析を通して』の関連リポジトリ。

## docs/ ─ 建築CAD/CGソフトウェア系譜 3Dネットワーク

`docs/` 以下は、卒論の資料編「現代における代表的CAD,CGソフトウェア」をもとに構成した、CAD/CGソフトウェア28本・開発企業/組織29・プラグイン3の関係を辿れる3Dネットワーク可視化（[three.js](https://threejs.org/) ベースの [3d-force-graph](https://github.com/vasturiano/3d-force-graph) を使用）。

タイムラインを動かすと、その年までに存在した企業・ソフトウェアの勢力図が再生され、買収・提携によって業界が再編されていく様子を見ることができる。

### ローカルで見る

外部CDNには依存していないので、`docs/` を静的サーバーで配信するだけで動く。

```sh
cd docs
python3 -m http.server 8000
# http://localhost:8000 を開く
```

### 構成

```
docs/
├── index.html          # エントリーポイント
├── style.css
├── main.js              # グラフ描画・タイムライン・フィルタ・詳細パネルのロジック
├── data/
│   └── software-graph.json   # ソフトウェア/企業/プラグインのノード・リンクデータ
└── vendor/
    └── 3d-force-graph.min.js # MIT License, https://github.com/vasturiano/3d-force-graph
```

データはすべて卒論資料編のテキストから手作業で構造化したもの。年表・買収関係のうち、原文に明記のない年（例：UGS社が現Siemens PLM Softwareへ移行した正確な時期）は個別のリンクとして持たせず、単一の組織として連続的に扱っている。
