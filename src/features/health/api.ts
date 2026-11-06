import { queryOptions } from "@tanstack/react-query";
import { api, parseResponse } from "@/lib/api";

export const healthQueryOptions = () =>
  queryOptions({
    queryKey: ["health"],
    queryFn: () => parseResponse(api.health.$get()),
  });
