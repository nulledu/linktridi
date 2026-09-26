"use client";

import { useEffect, useRef, useState } from "react";
import type { CreativeIntelligencePayload } from "@/lib/creative-intelligence/types";

export function useCreativeIntelligence({ creativeKey, adIds, since, until }: {
  creativeKey: string;
  adIds: string[];
  since: string;
  until: string;
}) {
  const [payload, setPayload] = useState<CreativeIntelligencePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestedCreative = useRef(creativeKey);
  const latestRequest = useRef(0);
  const adIdsKey = adIds.filter(Boolean).join(",");

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++latestRequest.current;
    if (requestedCreative.current !== creativeKey) {
      requestedCreative.current = creativeKey;
      setPayload(null);
    }
    setLoading(true);
    setError(null);

    const query = new URLSearchParams({ key: creativeKey, since, until, ads: adIdsKey });
    fetch(`/api/trafego/criativos/inteligencia?${query}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("A análise histórica não pôde ser carregada agora.");
        return response.json() as Promise<CreativeIntelligencePayload>;
      })
      .then((nextPayload) => {
        if (latestRequest.current === requestId) setPayload(nextPayload);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        if (latestRequest.current === requestId) {
          setError(caught instanceof Error ? caught.message : "A análise histórica não pôde ser carregada agora.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && latestRequest.current === requestId) setLoading(false);
      });

    return () => controller.abort();
  }, [creativeKey, adIdsKey, since, until]);

  return { payload, loading, error };
}
