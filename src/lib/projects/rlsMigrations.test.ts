/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function migration(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8');
}

describe('Supabase RLS migrations', () => {
  it('hardens child table ownership against project_id spoofing', () => {
    const sql = migration('0006_rls_ownership_hardening.sql');

    expect(sql).toContain('project_owned_by_current_user');
    expect(sql).toMatch(/on public\.project_snapshots for insert[\s\S]*public\.project_owned_by_current_user\(project_id\)/);
    expect(sql).toMatch(/on public\.project_assets for insert[\s\S]*public\.project_owned_by_current_user\(project_id\)/);
    expect(sql).toMatch(/on public\.project_assets for insert[\s\S]*public\.project_asset_path_matches_owner\(bucket_id, path, project_id\)/);
  });

  it('keeps project asset metadata aligned with private storage path ownership', () => {
    const sql = migration('0006_rls_ownership_hardening.sql');

    expect(sql).toContain("p_bucket_id = 'project-assets'");
    expect(sql).toContain("split_part(p_path, '/', 1) = auth.uid()::text");
    expect(sql).toContain("split_part(p_path, '/', 2) = p_project_id::text");
    expect(sql).toContain("array_length(string_to_array(p_path, '/'), 1) = 3");
  });

  it('requires comment rows to match the owning project on read write and delete policies', () => {
    const sql = migration('0006_rls_ownership_hardening.sql');

    expect(sql).toMatch(/on public\.project_comments for select[\s\S]*owner_user_id = public\.project_comment_project_owner\(project_id\)/);
    expect(sql).toMatch(/on public\.project_comments for insert[\s\S]*owner_user_id = public\.project_comment_project_owner\(project_id\)/);
    expect(sql).toMatch(/on public\.project_comments for update[\s\S]*owner_user_id = public\.project_comment_project_owner\(project_id\)[\s\S]*with check \([\s\S]*owner_user_id = public\.project_comment_project_owner\(project_id\)/);
    expect(sql).toMatch(/on public\.project_comments for delete[\s\S]*owner_user_id = public\.project_comment_project_owner\(project_id\)/);
  });
});
