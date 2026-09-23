# iPhone Zil Sesi Hazırlayıcı

Kendi video veya ses dosyanızdan en fazla 30 saniyelik bir bölüm seçip iPhone'da GarageBand ile zil sesi olarak dışa aktarmaya uygun bir ses dosyası hazırlayan mobil web uygulaması.

Canlı uygulama: [classman89.github.io/iphone-zil-sesi](https://classman89.github.io/iphone-zil-sesi/)

## Neler yapar?

- MP3, M4A, WAV ve MP4 dosyalarını kabul eder.
- Herkese açık doğrudan MP3, M4A, WAV veya MP4 bağlantılarını tarayıcıda indirir.
- Kişisel Codespace eşleştirildiğinde tek bir YouTube videosunu MP3, en fazla 720p MP4 veya zil sesi kaynağı olarak hazırlar.
- Başlangıç ve süreyi 1–30 saniye aralığında ayarlar.
- Ses seviyesini değiştirir; yumuşak başlangıç ve bitiş ekler.
- Önce M4A/AAC, desteklenmezse WAV çıktısı üretir.
- Dosyayı sunucuya yüklemeden doğrudan tarayıcıda işler.
- İndirme sonrasında GarageBand kurulum adımlarını gösterir.

## Gizlilik

Seçtiğiniz veya doğrudan dosya bağlantısından aldığınız medya uygulama sunucusuna gönderilmez; bu işlemler tarayıcınızda gerçekleşir. YouTube özelliğini kullanırsanız medya yalnızca sizin başlattığınız Codespace'in geçici diskinde işlenir ve yanıt tamamlandığında silinir. Uygulama hesap, veritabanı, analiz veya kalıcı bulut depolama kullanmaz.

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
- YouTube akışı oynatma listelerini, canlı yayınları, özel/ücretli/yaş kısıtlı videoları ve oturum veya çerez gerektiren içerikleri desteklemez.
- YouTube özelliğini yalnızca indirme ve dönüştürme hakkınız olan içeriklerde kullanın.
- İlk FFmpeg yüklemesi yaklaşık 30 MB olduğundan ilk dönüşüm bağlantı hızına göre biraz sürebilir; sonraki ziyaretlerde tarayıcı önbelleği yardımcı olur.

## Kişisel YouTube sunucusunu kullanma

GitHub Pages tek başına YouTube medyası indiremez. Bu nedenle sayfa, yalnızca siz kullanırken çalışan ve her başlangıçta yeni bir eşleştirme kodu üreten kişisel Codespaces sunucusuna bağlanır.

1. GitHub deposunda **Code → Codespaces → Create codespace on main** seçin.
2. Dev Container kurulumu bittikten sonra terminalde `npm run personal-server` çalıştırın.
3. **Ports → 8787 → Port Visibility → Public** seçin.
4. Terminalde yazan **Adres** ve **Eşleştirme kodu** değerlerini kopyalayın.
5. [Canlı uygulamayı](https://classman89.github.io/iphone-zil-sesi/) açın.
6. **Bağlantı → YouTube** bölümüne iki değeri girip **Sunucuya bağlan** seçeneğini kullanın.
7. Tek bir YouTube video bağlantısını yapıştırın; ardından **MP3 indir**, **MP4 indir** veya **Zil sesi hazırla** seçeneğini kullanın.
8. İşiniz bitince **Codespaces → Stop codespace** seçin; 8787 portunu gereksiz yere Public bırakmayın.

Public yapılan port GitHub oturum doğrulamasının arkasında değildir; erişim, uygulamanın her başlangıçta ürettiği geçici bearer token ile korunur. Eşleştirme kodunu paylaşmayın. Codespace veya kişisel sunucu yeniden başlatıldığında yeni kodla tekrar eşleştirme gerekir. Bu akış yalnızca indirme hakkınız olan medya içindir.

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
npm run typecheck:server
npm run build
npx playwright install chromium
npm run e2e
```

Birim, bileşen ve sunucu testleri doğrulama, token/CORS sınırı, geçici dosya temizliği, zaman seçimi, FFmpeg komutları, hata kurtarma ve URL temizliğini kapsar. Playwright testleri gerçek FFmpeg çekirdeğiyle kısa bir WAV dosyasını dönüştürür; kişisel sunucu akışını ise sahte ve ağdan bağımsız API yanıtlarıyla sınar. Testler gerçek YouTube veya `yt-dlp` çağrısı yapmaz.

## Dağıtım

`main` dalına gönderilen her değişiklik GitHub Actions içinde test edilir, statik site olarak derlenir ve GitHub Pages'a yayımlanır. Vite, `/iphone-zil-sesi/` alt yolu için yapılandırılmıştır.
