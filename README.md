# iPhone Zil Sesi Hazırlayıcı

Kendi video veya ses dosyanızdan en fazla 30 saniyelik bir bölüm seçip iPhone'da GarageBand ile zil sesi olarak dışa aktarmaya uygun bir ses dosyası hazırlayan mobil web uygulaması.

Canlı uygulama: [classman89.github.io/iphone-zil-sesi](https://classman89.github.io/iphone-zil-sesi/)

## Neler yapar?

- MP3, M4A, WAV ve MP4 dosyalarını kabul eder.
- Herkese açık doğrudan MP3, M4A, WAV veya MP4 bağlantılarını tarayıcıda indirir.
- Başlangıç ve süreyi 1–30 saniye aralığında ayarlar.
- Ses seviyesini değiştirir; yumuşak başlangıç ve bitiş ekler.
- Önce M4A/AAC, desteklenmezse WAV çıktısı üretir.
- Dosyayı sunucuya yüklemeden doğrudan tarayıcıda işler.
- İndirme sonrasında GarageBand kurulum adımlarını gösterir.

## Gizlilik

Seçtiğiniz veya doğrudan bağlantıdan aldığınız medya uygulama sunucusuna gönderilmez. İndirme ve dönüştürme işlemleri tarayıcınızda gerçekleşir. Uygulama hesap, veritabanı, analiz veya bulut depolama kullanmaz.

## iPhone'da kullanım

1. Safari'de uygulamayı açın; doğrudan medya bağlantısı girin veya cihazınızdaki MP3, M4A, WAV ya da MP4 dosyasını seçin.
2. Kullanmak istediğiniz başlangıcı ve en fazla 30 saniyelik süreyi ayarlayın.
3. **Zil sesini hazırla** ve ardından **Ses dosyasını indir** seçeneklerini kullanın.
4. Dosyayı Dosyalar uygulamasına kaydedin.
5. GarageBand'de Ses Kaydedici → Parçalar → Döngüler → Dosyalar yoluyla içe aktarın.
6. Parçalarım → Paylaş → Zil Sesi yoluyla dışa aktarın.

Apple'ın resmi adımları: [iPhone'da özel zil sesi oluşturma](https://support.apple.com/en-au/120692)

## Sınırlar

- En büyük dosya boyutu 200 MB'dir. Uzun veya büyük videolar özellikle eski iPhone modellerinde tarayıcı belleğini zorlayabilir.
- Web sitesi zil sesini iOS Ayarlar'a doğrudan kuramaz; son dışa aktarım GarageBand'de yapılır.
- DRM korumalı Apple Music parçaları desteklenmez.
- Bağlantı `https://` ile başlamalı, doğrudan medya dosyasına gitmeli ve kaynak sunucu tarayıcı erişimine (CORS) izin vermelidir.
- YouTube sayfa bağlantıları desteklenmez. YouTube, ses/video indirilmesine resmî API üzerinden izin vermediğinden yalnızca kullanma hakkınız olan doğrudan medya bağlantılarını veya yerel dosyaları kullanın.
- İlk FFmpeg yüklemesi yaklaşık 30 MB olduğundan ilk dönüşüm bağlantı hızına göre biraz sürebilir; sonraki ziyaretlerde tarayıcı önbelleği yardımcı olur.

## Yerel geliştirme

Node.js 24 ve npm gereklidir.

```bash
npm ci
npm run dev
```

`npm ci` sonrasında FFmpeg çekirdeği `public/ffmpeg` klasörüne otomatik kopyalanır. Yaşam döngüsü komutlarını kapattıysanız `npm run copy:ffmpeg` çalıştırın.

## Test ve derleme

```bash
npm run test:run
npm run build
npx playwright install chromium
npm run e2e
```

Birim ve bileşen testleri doğrulama, zaman seçimi, FFmpeg komutları, hata kurtarma ve URL temizliğini kapsar. Playwright testi gerçek FFmpeg çekirdeğiyle kısa bir WAV dosyasını dönüştürür ve indirir.

## Dağıtım

`main` dalına gönderilen her değişiklik GitHub Actions içinde test edilir, statik site olarak derlenir ve GitHub Pages'a yayımlanır. Vite, `/iphone-zil-sesi/` alt yolu için yapılandırılmıştır.
