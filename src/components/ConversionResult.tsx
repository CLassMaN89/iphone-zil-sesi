import type { ConversionResult as Result } from "../transcoder/types";

interface ConversionResultProps {
  result: Result;
  downloadUrl: string;
  onConvertAgain: () => void;
}

export function ConversionResult({
  result,
  downloadUrl,
  onConvertAgain,
}: ConversionResultProps) {
  return (
    <section className="conversion-result" aria-labelledby="result-heading">
      <h2 id="result-heading">Ses dosyan hazır</h2>
      <p>
        {result.format === "m4a"
          ? "iPhone için küçük boyutlu M4A dosyası oluşturuldu."
          : "Bu tarayıcıda AAC kullanılamadığı için yüksek kaliteli WAV hazırlandı."}
      </p>
      <a className="primary-action" href={downloadUrl} download={result.fileName}>
        Ses dosyasını indir
      </a>
      <button type="button" className="text-action" onClick={onConvertAgain}>
        Zil sesini yeniden hazırla
      </button>
    </section>
  );
}
