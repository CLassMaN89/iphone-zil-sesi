# iPhone Zil Sesi Hazırlayıcı — Tasarım Şartnamesi

## Amaç

Kullanıcının kendi telefonundaki video veya ses dosyasından en fazla 30 saniyelik bir bölüm seçmesini, bunu iPhone'da GarageBand ile zil sesine dönüştürmeye uygun bir ses dosyası olarak indirmesini ve kurulum adımlarını takip etmesini sağlayan mobil öncelikli bir web uygulaması geliştirmek.

İlk sürüm, iPhone üzerinden açılıp herhangi bir hesap oluşturmadan test edilebilmelidir. Kullanıcının medya dosyası cihazından ayrılmamalıdır.

## Kapsam

### Dahil

- MP3, M4A, WAV ve MP4 dosyası seçme
- Seçilen dosyanın temel bilgilerinin gösterilmesi
- Ses veya video ön izlemesi
- Başlangıç zamanı ve 1–30 saniye arası süre seçimi
- Seçilen bölümü tekrar dinleme
- İsteğe bağlı ses seviyesi ayarı
- İsteğe bağlı kısa fade-in ve fade-out
- İşlem ilerlemesi ve anlaşılır hata durumları
- iPhone'da Dosyalar uygulamasına kaydedilebilen çıktı
- GarageBand ile zil sesi oluşturmayı anlatan adım adım son ekran
- Mobil Safari, masaüstü Chrome ve Safari için duyarlı arayüz
- GitHub Pages üzerinden yayımlanabilen statik uygulama

### Dahil Değil

- YouTube veya başka platformlardan video indirme
- Kullanıcı hesabı, veritabanı veya sunucuya dosya yükleme
- Doğrudan iOS Ayarlar uygulamasına zil sesi kurma
- Bulut depolama, geçmiş veya paylaşılabilir kullanıcı bağlantıları
- DRM korumalı Apple Music parçalarının dönüştürülmesi

## Ürün Akışı

1. Açılış ekranı uygulamanın dosyaları cihazda işlediğini ve 30 saniye sınırını açıklar.
2. Kullanıcı desteklenen bir video veya ses dosyası seçer.
3. Uygulama dosyayı doğrular ve medya ön izlemesini açar.
4. Kullanıcı başlangıç zamanını ve bölüm süresini seçer; bölüm 30 saniyeyi geçemez.
5. Kullanıcı ses seviyesi ile fade-in/fade-out ayarlarını değiştirebilir ve bölümü dinleyebilir.
6. Kullanıcı “Zil sesini hazırla” eylemini başlatır.
7. Tarayıcı içindeki medya motoru seçilen bölümü dönüştürür ve ilerlemeyi gösterir.
8. Kullanıcı çıktı dosyasını indirir veya iOS paylaşım menüsünü kullanır.
9. Son ekran GarageBand'e aktarma, “Zil Sesi” olarak dışa aktarma ve varsayılan zil sesi olarak seçme adımlarını gösterir.

## Teknik Mimari

Uygulama Vite, React ve TypeScript ile statik bir istemci uygulaması olarak geliştirilecek. Medya işlemleri WebAssembly tabanlı FFmpeg ile tarayıcıda gerçekleştirilecek. Uygulama sunucu API'sine ihtiyaç duymayacak.

Ana birimler:

- `media`: dosya doğrulama, süre sınırları ve dönüştürme seçenekleri
- `transcoder`: FFmpeg yükleme, ilerleme bildirimleri, iptal ve çıktı üretimi
- `workspace`: kullanıcı akışının dosya seçimi, düzenleme, işleme ve tamamlanma durumları
- `guide`: GarageBand kurulum adımları
- `ui`: mobil öncelikli erişilebilir bileşenler ve durum geri bildirimi

FFmpeg çekirdeği uygulamayla aynı kaynaktan sunulacak veya yapılandırılmış güvenilir statik varlıklardan yüklenecek. GitHub Pages alt yolu, Vite `base` yapılandırmasıyla desteklenir.

## Çıktı Biçimi

Birincil çıktı AAC ses içeren `.m4a` dosyasıdır. Tarayıcı/codec uyumsuzluğu yaşanırsa uygulama WAV çıktısına geri dönebilir. Dosya adı güvenli karakterlere dönüştürülür ve seçilen bölümün zil sesi olduğu anlaşılır biçimde adlandırılır.

Uygulama `.m4r` dosyasını iOS'a doğrudan zil sesi olarak kurduğunu iddia etmeyecek. Kullanıcı GarageBand üzerinden “Zil Sesi” dışa aktarımını tamamlar.

## Doğrulama ve Sınırlar

- Desteklenmeyen dosya türleri işleme başlamadan reddedilir.
- Boş, okunamayan veya süresi belirlenemeyen dosyalar için çözüm öneren hata gösterilir.
- Seçim başlangıcı negatif olamaz ve medya süresini geçemez.
- Seçilen bölüm 1 saniyeden kısa, 30 saniyeden uzun veya kalan medya süresinden uzun olamaz.
- İlk sürümde dosya boyutu üst sınırı 200 MB'dir; iPhone bellek sınırını korumak için kullanıcıya açıkça bildirilir.
- Dönüştürme başarısız olursa kullanıcı ayarlarını kaybetmeden tekrar deneyebilir.
- İşlem bittiğinde geçici nesne URL'leri ve FFmpeg dosyaları mümkün olduğu ölçüde temizlenir.

## Görsel Tasarım

Arayüz, iPhone'daki fiziksel ses düğmeleri ve ses dalgası fikrinden hareket eden sade bir “ses çalışma tezgâhı” görünümünde olacak.

- Ana zemin: `#F6F8FB`
- Metin: `#17202A`
- İşlem rengi: `#176B87`
- Zaman çizgisi vurgusu: `#F2B134`
- Başarı: `#16825D`
- Hata: `#B83A3A`

Tipografi, okunabilirliği yüksek sistem yazı tipi yığını kullanır; iPhone'da San Francisco doğal olarak devreye girer. Ana etkileşim alanı tek sütunludur. Zaman seçimi, sayısal girişlerle desteklenen belirgin bir zaman çizgisi olarak sunulur. Kart yığını görünümü yerine, aşamalar tek bir çalışma alanında durum değiştirerek ilerler.

Klavye odağı görünür olacak, renkler WCAG AA kontrastını hedefleyecek ve hareket azaltma tercihi uygulanacaktır.

## Test Stratejisi

- Birim testleri: dosya doğrulama, zaman aralığı normalizasyonu, dosya adı üretimi ve dönüştürme seçenekleri
- Bileşen testleri: dosya seçimi, geçersiz dosya mesajları, 30 saniye sınırı ve akış durumları
- Tarayıcı testi: örnek kısa medya dosyasıyla yükleme, bölüm seçme, dönüştürme ve indirme akışı
- Yapı testi: GitHub Pages alt yolu ile üretim derlemesi
- Manuel cihaz kontrolü: güncel iPhone Safari'de dosya seçimi, ön izleme, çıktı indirme ve GarageBand aktarımı

FFmpeg'in kendisi birim testlerinde taklit edilmeyecek; dönüştürücü sınırında küçük bir adaptör kullanılarak uygulamanın gerçek davranışı test edilecek. En az bir tarayıcı testi gerçek FFmpeg çekirdeğiyle çalıştırılacak.

## Dağıtım

Kaynak kod GitHub'da `CLassMaN89/iphone-zil-sesi` adlı herkese açık depoda tutulacak. GitHub Actions, ana dala yapılan gönderimlerde test ve üretim derlemesini çalıştıracak; başarılı derlemeyi GitHub Pages'a yayımlayacak.

README; yerel kurulum, desteklenen biçimler, gizlilik yaklaşımı, iPhone kullanım adımları, bilinen sınırlar ve canlı test bağlantısını içerecek.

## Kabul Ölçütleri

- Uygulama iPhone Safari'de açılır ve dosya seçtirir.
- Desteklenen bir medya dosyasından 1–30 saniyelik bölüm seçilebilir.
- Seçilen bölüm ön izlenebilir ve indirilebilir bir ses dosyasına dönüştürülebilir.
- Kullanıcı dosyası ağ üzerinden uygulama sunucusuna gönderilmez.
- Kullanıcı GarageBand ile zil sesi kurmak için gereken adımları uygulama içinde görebilir.
- Otomatik testler ve üretim derlemesi başarılıdır.
- GitHub Pages bağlantısı HTTPS üzerinden erişilebilir durumdadır.
