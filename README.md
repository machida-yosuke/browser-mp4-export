# browser-mp4-export

Canvas 2D のアニメーションと既存 mp4 を連結し、ブラウザ内で mp4（H.264 + AAC）に書き出すサンプル。mediabunny を使用。
音声は指定した 1 ファイルを動画全体の先頭から敷く（長ければ切り詰め、短ければ無音で埋める）。静的動画の元音声は使わない。canvas の下のタイムラインで再生・シークしてプレビューできる。
フレームレートは UI で指定でき、書き出しとプレビューの両方に適用される。

```sh
npm install
npm run dev
```

## 検証用素材の生成

`public/sample/sample.mp4` は ffmpeg で生成している。

```sh
# 640x360 / 3 秒 / testsrc + 440Hz サイン音声 (AAC 48000Hz 2ch)
ffmpeg -y -f lavfi -i testsrc=size=640x360:rate=30:duration=3 \
  -f lavfi -i sine=frequency=440:sample_rate=48000:duration=3 \
  -c:v libx264 -pix_fmt yuv420p -b:v 300k -c:a aac -b:a 64k -ac 2 -shortest \
  -movflags +faststart public/sample/sample.mp4
```

サンプル音声は maou_14_shining_star.mp3（魔王魂）。
