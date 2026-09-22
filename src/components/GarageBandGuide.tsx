export function GarageBandGuide() {
  return (
    <section className="garageband-guide" aria-labelledby="garageband-heading">
      <div className="guide-intro">
        <h2 id="garageband-heading">iPhone’da zil sesi olarak ayarla</h2>
        <p>GarageBand içinde dosyanı “Zil Sesi” olarak dışa aktar.</p>
      </div>
      <ol>
        <li>
          <strong>Dosyalar’a kaydet</strong>
          <span>İndirdiğin sesi iPhone’daki Dosyalar uygulamasında bul.</span>
        </li>
        <li>
          <strong>GarageBand’i aç</strong>
          <span>Ses Kaydedici’yi seç ve Parçalar görünümüne geç.</span>
        </li>
        <li>
          <strong>Dosyayı içe aktar</strong>
          <span>Döngüler simgesinden Dosyalar’ı açıp sesini çalışma alanına sürükle.</span>
        </li>
        <li>
          <strong>Zil Sesi olarak paylaş</strong>
          <span>Parçayı sola hizala; Parçalarım → Paylaş → Zil Sesi yolunu izle.</span>
        </li>
        <li>
          <strong>Kullanacağın yeri seç</strong>
          <span>Standart zil sesi yap veya belirli bir kişiye ata.</span>
        </li>
      </ol>
      <a
        className="guide-link"
        href="https://support.apple.com/en-au/120692"
        target="_blank"
        rel="noreferrer"
      >
        Apple'ın ayrıntılı rehberi
      </a>
    </section>
  );
}
