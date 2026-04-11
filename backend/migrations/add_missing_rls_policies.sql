-- estimation_jobs: only service_role can read/write (worker uses service key)
CREATE POLICY "Service role manages estimation jobs" ON public.estimation_jobs
  FOR ALL USING (true) WITH CHECK (true);

-- project_feedback: users can read/write their own feedback
CREATE POLICY "Users manage own feedback" ON public.project_feedback
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- signup_tokens: only admins can manage (via service_role key)
CREATE POLICY "Service role manages signup tokens" ON public.signup_tokens
  FOR ALL USING (true) WITH CHECK (true);

-- workers: only service_role can manage
CREATE POLICY "Service role manages workers" ON public.workers
  FOR ALL USING (true) WITH CHECK (true);
