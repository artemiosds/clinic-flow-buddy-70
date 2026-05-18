import { useEffect, useState } from "react";

/**
 * Returns a value that updates only after `delay` ms of no changes.
 * Use to throttle expensive derivations (filters, queries) driven by typing.
 *
 * Usage:
 *   const [search, setSearch] = useState("");
 *   const debouncedSearch = useDebounce(search, 300);
 *   const filtered = useMemo(() => list.filter(x => match(x, debouncedSearch)), [list, debouncedSearch]);
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}

export default useDebounce;
