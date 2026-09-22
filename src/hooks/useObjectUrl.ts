import { useEffect, useState } from "react";

export function useObjectUrl(source?: Blob): string | undefined {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!source) {
      setUrl(undefined);
      return;
    }

    const nextUrl = URL.createObjectURL(source);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [source]);

  return url;
}
