// Hook that loads/saves one config file; conversions live in convert.js.
import { useState, useEffect, useCallback } from "/vendor/htm-preact.js";
import { get, put } from "./api.js";
import { toast } from "./ui.js";
export * from "./convert.js";

// ---------- file hook ----------

/**
 * Loads a config file and keeps a local editable copy.
 * parse/serialize convert between the parsed YAML and the page's model.
 */
export function useConfigFile(name, { parse = (d) => d, serialize = (m) => m } = {}) {
  const [file, setFile] = useState(null);
  const [model, setModel] = useState(null);
  const [original, setOriginal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const f = await get(`/api/files/${name}`);
      setFile(f);
      if (f.error) {
        setError(f.error);
        setModel(null);
        return;
      }
      const m = parse(f.data);
      setModel(m);
      setOriginal(JSON.stringify(m));
    } catch (e) {
      setError({ message: e.message });
    }
  }, [name]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = model !== null && original !== null && JSON.stringify(model) !== original;

  useEffect(() => {
    window.__hcDirty = window.__hcDirty || new Set();
    if (dirty) window.__hcDirty.add(name);
    else window.__hcDirty.delete(name);
    return () => window.__hcDirty.delete(name);
  }, [dirty, name]);

  const save = async () => {
    setSaving(true);
    try {
      const f = await put(`/api/files/${name}`, { data: serialize(model), baseMtime: file?.mtime ?? 0 });
      setFile(f);
      const m = parse(f.data);
      setModel(m);
      setOriginal(JSON.stringify(m));
      toast(`${name} saved${f.backupId ? " — previous version backed up" : ""}`);
      return true;
    } catch (e) {
      toast(e.message, "error");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const discard = () => setModel(JSON.parse(original));

  return { file, model, setModel, dirty, saving, save, discard, reload: load, error };
}

/** Load a file read-only (e.g. docker.yaml for the server dropdown). */
export function useFileData(name) {
  const [data, setData] = useState(null);
  useEffect(() => {
    get(`/api/files/${name}`)
      .then((f) => setData(f.data ?? null))
      .catch(() => setData(null));
  }, [name]);
  return data;
}
