-- Seed data for ProjectFlux
-- Clear existing data
TRUNCATE task_dependencies, tasks, lists, folders, spaces, workspaces CASCADE;

-- Insert workspace
INSERT INTO workspaces (id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Cloudzone');

-- Insert space
INSERT INTO spaces (id, workspace_id, name) VALUES
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'SaaScribes');

-- Insert folder
INSERT INTO folders (id, space_id, name) VALUES
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Product Launch');

-- Insert list
INSERT INTO lists (id, folder_id, space_id, name, color, icon) VALUES
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Q2 Onboarding', '#2563EB', 'folder-kanban');

-- Insert tasks
-- Top-level project tasks
INSERT INTO tasks (id, list_id, parent_id, name, status, task_type, color, icon, start_date, end_date, position) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', NULL, 'Client Onboarding - Acme Corp', 'IN_PROGRESS', 'project', '#2563EB', 'briefcase', '2026-04-01', '2026-04-30', 0),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', NULL, 'Client Onboarding - TechFlow', 'NOT_STARTED', 'project', '#7C3AED', 'rocket', '2026-04-15', '2026-05-15', 1),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '44444444-4444-4444-4444-444444444444', NULL, 'Internal Process Improvements', 'IN_PROGRESS', 'project', '#0F766E', 'layers-3', '2026-04-01', '2026-05-31', 2);

-- Subtasks for Acme Corp
INSERT INTO tasks (id, list_id, parent_id, name, status, task_type, color, icon, start_date, end_date, onboarding_completion, position) VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Initial Contact & Discovery', 'COMPLETED', 'task', '#059669', 'message-square', '2026-04-01', '2026-04-03', '2026-04-03', 0),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Contract & Legal Review', 'IN_PROGRESS', 'task', '#F59E0B', 'scale', '2026-04-04', '2026-04-10', NULL, 1),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', '44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Technical Setup & Integration', 'NOT_STARTED', 'task', '#6366F1', 'database', '2026-04-11', '2026-04-20', NULL, 2),
  ('gggggggg-gggg-gggg-gggg-gggggggggggg', '44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Training & Go-Live', 'NOT_STARTED', 'task', '#EC4899', 'graduation-cap', '2026-04-21', '2026-04-30', NULL, 3);

-- Nested subtasks under Technical Setup
INSERT INTO tasks (id, list_id, parent_id, name, status, task_type, color, icon, start_date, end_date, position) VALUES
  ('hhhhhhhh-hhhh-hhhh-hhhh-hhhhhhhhhhhh', '44444444-4444-4444-4444-444444444444', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'API Credentials Setup', 'NOT_STARTED', 'task', '#0EA5E9', 'plug-zap', '2026-04-11', '2026-04-13', 0),
  ('iiiiiiii-iiii-iiii-iiii-iiiiiiiiiiii', '44444444-4444-4444-4444-444444444444', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'Data Migration', 'NOT_STARTED', 'task', '#9333EA', 'database', '2026-04-14', '2026-04-18', 1),
  ('jjjjjjjj-jjjj-jjjj-jjjj-jjjjjjjjjjjj', '44444444-4444-4444-4444-444444444444', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'QA & Testing', 'NOT_STARTED', 'task', '#DC2626', 'flask-conical', '2026-04-18', '2026-04-20', 2);

-- Subtasks for TechFlow
INSERT INTO tasks (id, list_id, parent_id, name, status, task_type, color, icon, start_date, end_date, position) VALUES
  ('kkkkkkkk-kkkk-kkkk-kkkk-kkkkkkkkkkkk', '44444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Initial Contact & Discovery', 'INITIAL_CONTACT', 'task', '#F97316', 'phone-call', '2026-04-15', '2026-04-17', 0),
  ('llllllll-llll-llll-llll-llllllllllll', '44444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Requirements Gathering', 'NOT_STARTED', 'task', '#14B8A6', 'check-square', '2026-04-18', '2026-04-25', 1);

-- Add some dependencies
INSERT INTO task_dependencies (predecessor_id, successor_id, dependency_type) VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'FS'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'FS'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'gggggggg-gggg-gggg-gggg-gggggggggggg', 'FS'),
  ('hhhhhhhh-hhhh-hhhh-hhhh-hhhhhhhhhhhh', 'iiiiiiii-iiii-iiii-iiii-iiiiiiiiiiii', 'FS'),
  ('iiiiiiii-iiii-iiii-iiii-iiiiiiiiiiii', 'jjjjjjjj-jjjj-jjjj-jjjj-jjjjjjjjjjjj', 'FS');
