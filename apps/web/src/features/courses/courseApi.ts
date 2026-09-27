import {
  CourseListResponseSchema,
  CourseResponseSchema,
  type CourseDocument,
  type CourseListResponse,
  type CourseResponse,
  type CreateCourseRequest
} from '@freechesscoach/shared';
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query';
import { apiGet, apiPost, apiPut } from '../../api/client.js';

export function useCourses(): UseQueryResult<CourseListResponse> {
  return useQuery({ queryKey: ['courses'], queryFn: ({ signal }) => apiGet('/api/courses', CourseListResponseSchema, signal) });
}

export function useCourse(id: string): UseQueryResult<CourseResponse> {
  return useQuery({ queryKey: ['course', id], queryFn: ({ signal }) => apiGet(`/api/courses/${id}`, CourseResponseSchema, signal) });
}

export function useCreateCourse(): UseMutationResult<CourseResponse, Error, CreateCourseRequest> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (intake: CreateCourseRequest) => apiPost('/api/courses', intake, CourseResponseSchema),
    onSuccess: (course) => {
      queryClient.setQueryData(['course', course.id], course);
      void queryClient.invalidateQueries({ queryKey: ['courses'] });
    }
  });
}

export function useSaveCourseDraft(id: string): UseMutationResult<void, Error, CourseDocument> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (document: CourseDocument) => apiPut(`/api/courses/${id}/draft`, { document }),
    onSuccess: (_result, document) => {
      queryClient.setQueryData<CourseResponse>(['course', id], (course) => (course ? { ...course, title: document.title, document } : course));
      void queryClient.invalidateQueries({ queryKey: ['courses'] });
    }
  });
}

/** "Build without AI": replaces the draft's chapters and episodes. */
export function useBuildCourseSkeleton(id: string): UseMutationResult<CourseResponse, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost(`/api/courses/${id}/skeleton`, {}, CourseResponseSchema),
    onSuccess: (course) => queryClient.setQueryData(['course', id], course)
  });
}
