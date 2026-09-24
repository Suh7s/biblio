import { useCallback, useEffect, useRef, useState } from "react";
import { aiRequest, isCanceled, errorMessage } from "./api.js";

export function useAiRequest() {
  const controller = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => controller.current?.abort(), []);
  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setError("");
  }, []);
  const run = useCallback(async (method, path, input) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError("");
    try {
      const result = await aiRequest(method, path, input, current.signal);
      return controller.current === current ? result : undefined;
    } catch (err) {
      if (!isCanceled(err) && controller.current === current)
        setError(errorMessage(err));
    } finally {
      if (controller.current === current) {
        setBusy(false);
        controller.current = null;
      }
    }
  }, []);
  return { busy, error, run, cancel };
}
