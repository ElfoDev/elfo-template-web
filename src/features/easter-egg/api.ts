import { queryOptions } from "@tanstack/react-query";
import { api, parseResponse } from "@/lib/api";

export const easterEggQueryOptions = () =>
  queryOptions({
    queryKey: ["easter-egg"],
    queryFn: () => parseResponse(api["easter-egg"].$get()),
  });
