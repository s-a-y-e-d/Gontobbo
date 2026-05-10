"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConvex } from "convex/react";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import { getFunctionName } from "convex/server";

type SnapshotQueryResult<Query extends FunctionReference<"query">> = {
  data: FunctionReturnType<Query> | undefined;
  error: Error | null;
  isLoading: boolean;
  isRefreshing: boolean;
  refresh: () => Promise<FunctionReturnType<Query> | undefined>;
};

function getArgsKey(args: unknown) {
  return JSON.stringify(args);
}

export function useSnapshotQuery<Query extends FunctionReference<"query">>(
  query: Query,
  args: FunctionArgs<Query> | "skip",
): SnapshotQueryResult<Query> {
  const convex = useConvex();
  const [data, setData] = useState<FunctionReturnType<Query> | undefined>();
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(args !== "skip");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const requestIdRef = useRef(0);
  const isMountedRef = useRef(false);
  const queryRef = useRef(query);
  const argsRef = useRef(args);
  const dataRef = useRef<FunctionReturnType<Query> | undefined>(undefined);
  const queryName = useMemo(() => getFunctionName(query), [query]);
  const argsKey = useMemo(() => getArgsKey(args), [args]);

  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const currentArgs = argsRef.current;

    if (currentArgs === "skip") {
      setData(undefined);
      setError(null);
      setIsLoading(false);
      setIsRefreshing(false);
      return undefined;
    }

    setError(null);
    setIsLoading((current) => current || dataRef.current === undefined);
    setIsRefreshing(dataRef.current !== undefined);

    try {
      const result = await convex.query(queryRef.current, currentArgs);
      if (isMountedRef.current && requestIdRef.current === requestId) {
        setData(result);
        setError(null);
      }
      return result;
    } catch (caughtError) {
      const nextError =
        caughtError instanceof Error
          ? caughtError
          : new Error("Snapshot query failed.");
      if (isMountedRef.current && requestIdRef.current === requestId) {
        setError(nextError);
      }
      return undefined;
    } finally {
      if (isMountedRef.current && requestIdRef.current === requestId) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [convex]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    queryRef.current = query;
    argsRef.current = args;
  }, [args, argsKey, query, queryName]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    void refresh();
  }, [argsKey, queryName, refresh]);

  return {
    data,
    error,
    isLoading,
    isRefreshing,
    refresh,
  };
}
