import { BugReportResponseSchema, type CreateBugReportRequest } from '@freechesscoach/shared';
import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { apiPost } from '../api/client.js';

export function useSendBugReport(): UseMutationResult<{ id: string }, Error, CreateBugReportRequest> {
  return useMutation({
    mutationFn: (report: CreateBugReportRequest) => apiPost('/api/bug-reports', report, BugReportResponseSchema)
  });
}
