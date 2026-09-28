import {
  CourseDebugResponseSchema,
  CourseListResponseSchema,
  CourseResponseSchema,
  type CourseDebugResponse,
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

const GENERATION_POLL_MS = 2000;

/** Polls while the AI is writing the course (docs/courses.md §5.2). */
export function useCourse(id: string): UseQueryResult<CourseResponse> {
  return useQuery({
    queryKey: ['course', id],
    queryFn: ({ signal }) => apiGet(`/api/courses/${id}`, CourseResponseSchema, signal),
    refetchInterval: (query) => (isGenerating(query.state.data) ? GENERATION_POLL_MS : false)
  });
}

/** Task 80.6: the latest run's AI calls; follows the run while it writes. */
export function useCourseDebug(id: string, generating: boolean): UseQueryResult<CourseDebugResponse> {
  return useQuery({
    queryKey: ['course-debug', id],
    queryFn: ({ signal }) => apiGet(`/api/courses/${id}/debug`, CourseDebugResponseSchema, signal),
    refetchInterval: generating ? GENERATION_POLL_MS : false
  });
}

export function isGenerating(course: CourseResponse | undefined): boolean {
  const status = course?.generation?.status;
  return status === 'queued' || status === 'running';
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

/** "Write with AI": queues the job, or resumes a failed one. */
export function useStartCourseGeneration(id: string): UseMutationResult<CourseResponse, Error, { restart: boolean }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { restart: boolean }) => apiPost(`/api/courses/${id}/generate`, body, CourseResponseSchema),
    onSuccess: (course) => queryClient.setQueryData(['course', id], course)
  });
}

/** One episode again, with the creator's instruction (§6.5). */
export function useRegenerateEpisode(id: string): UseMutationResult<CourseResponse, Error, { episodeId: string; instruction: string }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ episodeId, instruction }: { episodeId: string; instruction: string }) =>
      apiPost(`/api/courses/${id}/episodes/${episodeId}/regenerate`, { instruction }, CourseResponseSchema),
    onSuccess: (course) => queryClient.setQueryData(['course', id], course)
  });
}
