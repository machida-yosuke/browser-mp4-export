# guitarfish

Canvas 2D のアニメーションと既存 mp4 を連結し、ブラウザ内で mp4（H.264 + AAC）に書き出すサンプル。mediabunny を使用。

```sh
npm install
npm run dev
```

## 検証用素材の生成

`public/sample/` の素材は ffmpeg で生成している。

```sh
# 640x360 / 3 秒 / testsrc + 440Hz サイン音声 (AAC 48000Hz 2ch)
ffmpeg -y -f lavfi -i testsrc=size=640x360:rate=30:duration=3 \
  -f lavfi -i sine=frequency=440:sample_rate=48000:duration=3 \
  -c:v libx264 -pix_fmt yuv420p -b:v 300k -c:a aac -b:a 64k -ac 2 -shortest \
  -movflags +faststart public/sample/sample.mp4

# 880Hz サイン / 2 秒 / 44100Hz モノラル（48000Hz 2ch へのリサンプル経路を通すため）
ffmpeg -y -f lavfi -i sine=frequency=880:sample_rate=44100:duration=2 \
  -ac 1 -c:a pcm_s16le public/sample/tone.wav
```
