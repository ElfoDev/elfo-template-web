import type { CreateProjectInput, UpdateProjectInput } from "@shared/projects";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, parseResponse } from "@/lib/api";

export const projectKeys = {
  all: ["projects"] as const,
  detail: (id: string) => ["projects", id] as const,
};

export const projectsQueryOptions = () =>
  queryOptions({
    queryKey: projectKeys.all,
    queryFn: () => parseResponse(api.projects.$get()),
  });

export const projectQueryOptions = (id: string) =>
  queryOptions({
    queryKey: projectKeys.detail(id),
    queryFn: () => parseResponse(api.projects[":id"].$get({ param: { id } })),
  });

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (json: CreateProjectInput) => parseResponse(api.projects.$post({ json })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
  });
}

export function useUpdateProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (json: UpdateProjectInput) =>
      parseResponse(api.projects[":id"].$patch({ param: { id }, json })),
    onSuccess: (project) => {
      queryClient.setQueryData(projectKeys.detail(id), project);
      return queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => parseResponse(api.projects[":id"].$delete({ param: { id } })),
    // Só a lista: o detalhe do projeto apagado responderia 404 se fosse refeito.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.all, exact: true }),
  });
}
