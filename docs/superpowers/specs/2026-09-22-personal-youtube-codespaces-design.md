# Kişisel YouTube Codespaces Tasarımı

## Amaç

Mevcut `https://classman89.github.io/iphone-zil-sesi/` arayüzünü koruyarak, yalnızca proje sahibinin kullanacağı geçici bir GitHub Codespaces backend'ine bağlanmak. Kullanıcı bir YouTube bağlantısını yapıştırıp videoyu MP3 veya MP4 olarak indirebilecek ya da videonun sesini mevcut zil sesi düzenleyicisine aktarabilecek.

Bu özellik yalnızca kullanıcının indirme ve dönüştürme hakkına sahip olduğu içerikler içindir. Genel kullanıma açık bir YouTube indirme servisi oluşturulmayacaktır.

## Başarı Ölçütleri

- Kullanıcı işlemlere mevcut GitHub Pages adresinden başlar.
- Codespaces backend kapalıyken yerel dosya ve doğrudan medya bağlantısı özellikleri çalışmaya devam eder.
- Backend açık ve eşleştirilmişken YouTube bağlantısı doğrulanır, video bilgileri gösterilir ve MP3, MP4 veya zil sesi seçenekleri sunulur.
- Üretilen dosyalar işlem tamamlandıktan veya başarısız olduktan sonra backend'den silinir.
- Hiçbir kalıcı erişim anahtarı repoya, Pages derlemesine veya URL sorgu dizisine yazılmaz.
- iPhone'a doğrudan zil sesi atama vaat edilmez; GarageBand dışa aktarma rehberi korunur.

## Kapsam Dışı

- Herkese açık veya sürekli çalışan bir indirme servisi.
- Oynatma listeleri, canlı yayınlar, Shorts koleksiyonları veya kanal toplu indirmeleri.
- Yaş kısıtlı, ücretli, özel, oturum veya çerez gerektiren videolar.
- DRM aşma, coğrafi kısıtlama aşma veya YouTube hesabı çerezlerini backend'e aktarma.
- YouTube Premium çevrimdışı dosyalarını dışa aktarma.
- Web sayfasından iOS Ayarlar'a doğrudan zil sesi atama.

## Kullanıcı Deneyimi

### Kaynak seçimi

Cam arayüzdeki üst kaynak seçimi `Video yükle`, `Ses yükle` ve `Bağlantı` olarak kalır. `Bağlantı` panelinin içinde iki seçenek bulunur:

- `YouTube`: kişisel Codespaces backend'ini kullanır.
- `Doğrudan dosya`: mevcut HTTPS MP3, M4A, WAV veya MP4 içe aktarma akışını kullanır.

### Backend bağlantısı

YouTube modu açıldığında sayfa bir bağlantı durumu gösterir:

- `Kişisel sunucu bağlı`: sağlık kontrolü ve token doğrulaması başarılıdır.
- `Kişisel sunucu kapalı`: kullanıcıya Codespace'i başlatma ve eşleştirme alanı gösterilir.

Codespace başlatıldığında terminalde iki değer yazdırılır:

1. Codespaces backend adresi, örneğin `https://<codespace>-8787.app.github.dev`.
2. Her backend başlangıcında yeniden üretilen yüksek entropili eşleştirme kodu.

Kullanıcı bu iki değeri GitHub Pages'taki eşleştirme formuna girer. Tarayıcı bunları yalnızca aynı cihazın `localStorage` alanında saklar. Token sayfa adresine, indirme dosyasına, hata metnine veya uygulama loglarına yazılmaz.

### YouTube akışı

1. Kullanıcı tek bir `youtube.com/watch`, `youtube.com/shorts` veya `youtu.be` bağlantısı yapıştırır.
2. Arayüz `Videoyu bul` komutunu gönderir.
3. Backend başlık, süre ve küçük resim adresini döndürür; medya indirmez.
4. Arayüz başlığı, süreyi ve aşağıdaki eylemleri gösterir:
   - `MP3 indir`: 192 kbps MP3.
   - `MP4 indir`: en fazla 720p, H.264/AAC uyumlu MP4.
   - `Zil sesi hazırla`: M4A sesini indirip mevcut tarayıcı düzenleyicisine `File` olarak aktarır.
5. Zil sesi akışında kullanıcı başlangıç ve en fazla 30 saniyelik süreyi seçer; mevcut ses seviyesi, fade ve M4A/WAV dönüştürme akışı değişmeden çalışır.
6. İndirme veya dönüştürme tamamlandığında GarageBand rehberi gösterilir.

## Sistem Mimarisi

### GitHub Pages istemcisi

React uygulaması statik olarak GitHub Pages'ta kalır. Yeni istemci birimleri:

- `PersonalServerSettings`: backend adresi ve eşleştirme kodunu yönetir.
- `personalServerStorage`: adres/token saklama, okuma ve temizleme sınırıdır.
- `personalMediaClient`: sağlık kontrolü, video inceleme ve dosya alma HTTP sözleşmesini uygular.
- `YouTubeImportPanel`: bağlantı, video özeti, durum ve üç eylemi sunar.

Mevcut dosya doğrulama, nesne URL yaşam döngüsü ve zil sesi düzenleyicisi yeniden kullanılır.

### Codespaces backend

Backend Node.js ve TypeScript ile yazılır. Express yalnızca API sunar; Pages dosyalarını barındırmaz. Codespace içinde Python `yt-dlp` ve sistem FFmpeg paketi bulunur.

Backend bir `MediaTool` arayüzü üzerinden dış komutları çalıştırır. Üretim uygulaması `yt-dlp` sürecini `spawn` ile argüman dizisi kullanarak başlatır; kullanıcı girdisi hiçbir zaman shell komutuna birleştirilmez.

### Dev Container

`.devcontainer` yapılandırması şunları sağlar:

- Node.js 24.
- Python 3 ve güncel `yt-dlp` kurulumu.
- FFmpeg.
- `npm ci` post-create kurulumu.
- Backend için `8787` port yönlendirme bildirimi.

Port kullanıcı tarafından Codespaces Ports panelinden `Public` yapılır. Portun internete açık olması nedeniyle uygulama seviyesinde bearer token zorunludur.

## API Sözleşmesi

Tüm `/api` uçları `Authorization: Bearer <token>` ister. `OPTIONS` CORS ön uç isteği token gerektirmez.

### `GET /api/health`

Başarılı yanıt:

```json
{
  "ok": true,
  "service": "iphone-ringtone-personal",
  "version": 1
}
```

### `POST /api/youtube/inspect`

İstek:

```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID"
}
```

Başarılı yanıt:

```json
{
  "id": "VIDEO_ID",
  "title": "Video başlığı",
  "durationSeconds": 245,
  "thumbnailUrl": "https://i.ytimg.com/..."
}
```

Backend inceleme sırasında `yt-dlp --dump-single-json --skip-download --no-playlist` kullanır. Süre 1–1200 saniye dışında ise istek reddedilir.

### `POST /api/youtube/download`

İstek:

```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "format": "mp3"
}
```

`format`, `mp3`, `mp4` veya `ringtone-source` değerlerinden biridir.

- `mp3`: 192 kbps MP3 döndürür.
- `mp4`: yüksekliği 720p'yi aşmayan MP4 döndürür.
- `ringtone-source`: tarayıcı düzenleyicisine verilecek M4A döndürür.

Başarılı yanıt dosya gövdesidir. `Content-Type`, güvenli `Content-Disposition` dosya adı ve `Content-Length` başlıkları gönderilir. Arayüz yanıtı Blob/File olarak işler.

İlk sürüm tek işlem çalıştırır. Başka işlem sürerken yeni istek `429` ve `PERSONAL_SERVER_BUSY` koduyla reddedilir.

## Güvenlik

- Backend başlangıcında `crypto.randomBytes(32)` ile token üretir.
- Token yalnızca terminale yazdırılır; düz metin dosyaya veya GitHub secret'a kaydedilmez.
- `Authorization` başlıkları loglanmaz.
- CORS yalnızca `https://classman89.github.io` ve yerel geliştirme origin'lerine izin verir.
- Yalnızca HTTPS ve bilinen YouTube alan adları kabul edilir. Keyfi URL alma desteklenmez; böylece SSRF yüzeyi açılmaz.
- Oynatma listesi parametreleri bulunsa bile `--no-playlist` zorunludur.
- `spawn` shell olmadan ve sabit argüman dizisiyle çağrılır.
- Her işlem benzersiz bir `mkdtemp` dizisinde çalışır.
- Geçici dizin başarı, hata, istemci bağlantıyı kesme ve süreç sonlanması yollarında silinir.
- Çıktı 200 MB'yi aşarsa işlem iptal edilir ve dosya sunulmaz.
- Video süresi en fazla 20 dakikadır.
- Backend aynı anda yalnızca bir indirme işlemi çalıştırır.
- Başlık ve dosya adları güvenli ASCII ada dönüştürülür.

## Hata Modeli

API hataları aşağıdaki biçimi kullanır:

```json
{
  "error": {
    "code": "INVALID_YOUTUBE_URL",
    "message": "Geçerli bir YouTube video bağlantısı girin."
  }
}
```

Desteklenen hata kodları:

- `UNAUTHORIZED`: eşleştirme kodu yanlış veya eksik.
- `ORIGIN_NOT_ALLOWED`: istek izin verilen arayüzden gelmiyor.
- `INVALID_YOUTUBE_URL`: alan adı veya video kimliği geçersiz.
- `VIDEO_UNAVAILABLE`: video bulunamadı, özel veya oturum gerektiriyor.
- `VIDEO_TOO_LONG`: süre 20 dakikayı aşıyor.
- `OUTPUT_TOO_LARGE`: çıktı 200 MB'yi aşıyor.
- `PERSONAL_SERVER_BUSY`: başka işlem sürüyor.
- `TOOL_UPDATE_REQUIRED`: YouTube değişikliği nedeniyle `yt-dlp` güncellemesi gerekiyor.
- `CONVERSION_FAILED`: indirme veya FFmpeg dönüşümü tamamlanamadı.

Arayüz teknik stderr metnini göstermez. Her kod için Türkçe düzeltme adımı sunar ve mevcut dosya seçim özelliklerini kullanılabilir bırakır.

## Gizlilik ve Dosya Yaşam Döngüsü

- Video veya ses GitHub Pages'a, GitHub reposuna ya da Actions artifact'ına yazılmaz.
- Medya yalnızca aktif Codespace'in geçici diskinde bulunur.
- Dosya HTTP yanıtı tamamlandıktan sonra geçici dizin silinir.
- Tarayıcı indirme Blob URL'lerini mevcut `useObjectUrl` yaşam döngüsüyle temizler.
- Kullanıcı `Bağlantıyı kaldır` dediğinde backend adresi ve token `localStorage` alanından silinir.

## Dağıtım ve Kullanım

GitHub Pages dağıtımı mevcut Actions iş akışıyla devam eder; CI sırasında gerçek YouTube indirmesi yapılmaz.

Kişisel kullanım adımları:

1. GitHub deposunda `Code → Codespaces → Create codespace` seçilir.
2. Dev Container kurulumu tamamlanır.
3. `npm run personal-server` çalıştırılır.
4. `8787` portu `Public` yapılır.
5. Terminaldeki backend adresi ve eşleştirme kodu GitHub Pages formuna girilir.
6. Kullanım bitince Codespace durdurulur veya silinir.

README bu adımları ekran adlarıyla açıklar ve portu gereksiz yere açık bırakmama uyarısı verir.

## Test Stratejisi

### Backend birim testleri

- YouTube alan adı ve video kimliği doğrulaması.
- `MediaTool` için MP3, MP4 ve M4A argümanlarının doğru üretilmesi.
- Süre, çıktı boyutu ve tek işlem sınırları.
- Token ve CORS reddi.
- Güvenli dosya adı.
- Başarı, süreç hatası ve istemci kesintisinde geçici dizin temizliği.

Gerçek `yt-dlp`, FFmpeg veya YouTube ağı bu testlerde kullanılmaz; `MediaTool` arayüzü kontrollü bir sahte uygulamayla sınanır.

### İstemci testleri

- Backend eşleştirme bilgilerinin kaydedilmesi ve kaldırılması.
- Bağlı/kapalı durumları.
- Video özeti ve üç eylemin görünmesi.
- MP3/MP4 indirme adlarının doğru olması.
- `ringtone-source` yanıtının mevcut düzenleyiciye aktarılması.
- API hata kodlarının kullanıcıya düzeltme adımıyla gösterilmesi.

### Tarayıcı testi

Playwright, sahte bir kişisel backend yanıtıyla GitHub Pages arayüzünde eşleştirme → inceleme → zil sesi düzenleyicisi akışını sınar. Mevcut gerçek FFmpeg yerel dosya dönüşüm testi korunur.

### Manuel Codespaces doğrulaması

Kullanım hakkı bulunan kısa bir test videosuyla aşağıdaki akışlar elle doğrulanır:

- MP3 indirme.
- 720p veya daha düşük MP4 indirme.
- Zil sesi düzenleyicisine M4A aktarma ve 30 saniyelik çıktı.
- Codespace kapatıldığında bağlantı durumunun `kapalı` olması.
- Kullanım sonrası geçici medya dosyası kalmaması.

## Operasyonel Sınırlar

- `yt-dlp` YouTube değişiklikleri nedeniyle zaman zaman güncelleme gerektirebilir. `TOOL_UPDATE_REQUIRED` mesajı kullanıcıyı Codespace'i yeniden oluşturma veya `yt-dlp` güncelleme adımına yönlendirir.
- Codespaces kotası ve ağ trafiği kullanıcının GitHub hesabına aittir.
- Backend yalnızca Codespace çalışırken kullanılabilir.
- GitHub Pages tek başına YouTube indirmesi yapmaz; arayüz bunu açıkça belirtir.
