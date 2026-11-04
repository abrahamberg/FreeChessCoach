import {
  CourseApiTokenListResponseSchema,
  CourseListResponseSchema,
  CourseResponseSchema,
  CreateCourseApiTokenResponseSchema,
  PublishCheckResponseSchema,
  type CourseApiTokenListResponse,
  type CourseListResponse,
  type CourseResponse,
  type CreateCourseApiTokenResponse,
  type PublishCheckResponse,
  type PublishCourseRequest,
  type UpdateCourseRequest
} from '@freechesscoach/shared';
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../../api/client.js';

/** docs/courses.md §2: every course; all editors share them. */
export function useCourses(): UseQueryResult<CourseListResponse> {
  return useQuery({ queryKey: ['courses'], queryFn: ({ signal }) => apiGet('/api/courses', CourseListResponseSchema, signal) });
}

export function useCourse(id: string): UseQueryResult<CourseResponse> {
  return useQuery({ queryKey: ['course', id], queryFn: ({ signal }) => apiGet(`/api/courses/${id}`, CourseResponseSchema, signal) });
}

/** §9: the full checks, with the engine facts, over the draft. */
export function usePublishCheck(id: string): UseQueryResult<PublishCheckResponse> {
  return useQuery({ queryKey: ['course-check', id], queryFn: ({ signal }) => apiGet(`/api/courses/${id}/publish-check`, PublishCheckResponseSchema, signal) });
}

/** Keeps the course and the list fresh after a change that returns the course. */
function useCourseMutation<T>(id: string, mutationFn: (body: T) => Promise<CourseResponse>): UseMutationResult<CourseResponse, Error, T> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (course) => {
      queryClient.setQueryData(['course', id], course);
      void queryClient.invalidateQueries({ queryKey: ['courses'] });
    }
  });
}

/** §9: the draft becomes the published copy. */
export function usePublishCourse(id: string): UseMutationResult<CourseResponse, Error, PublishCourseRequest> {
  return useCourseMutation(id, (body: PublishCourseRequest) => apiPost(`/api/courses/${id}/publish`, body, CourseResponseSchema));
}

/** §9: visibility, members' level, posted video links. */
export function useUpdateCourse(id: string): UseMutationResult<CourseResponse, Error, UpdateCourseRequest> {
  return useCourseMutation(id, (body: UpdateCourseRequest) => apiPatch(`/api/courses/${id}`, body, CourseResponseSchema));
}

/** Deletes a course for good; the page confirms first. */
export function useDeleteCourse(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/courses/${id}`),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: ['course', id] });
      void queryClient.invalidateQueries({ queryKey: ['courses'] });
    }
  });
}

/** §2: the signed-in editor's own tokens for the course API. */
export function useCourseTokens(): UseQueryResult<CourseApiTokenListResponse> {
  return useQuery({ queryKey: ['course-tokens'], queryFn: ({ signal }) => apiGet('/api/course-tokens', CourseApiTokenListResponseSchema, signal) });
}

export function useCreateCourseToken(): UseMutationResult<CreateCourseApiTokenResponse, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiPost('/api/course-tokens', { name }, CreateCourseApiTokenResponseSchema),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['course-tokens'] })
  });
}

export function useRevokeCourseToken(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/course-tokens/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['course-tokens'] })
  });
}
