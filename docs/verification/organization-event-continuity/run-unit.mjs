import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
const paths = execFileSync('rg', ['--files', 'src'], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/).map(path => path.replaceAll('\\', '/'));
const relevant = path => path.includes('/__tests__/') && /\.test\.tsx?$/.test(path) && (
 path.startsWith('src/components/events/') ||
 /src\/lib\/__tests__\/(event|studentEventUpdates|adminEventSubmissions|campusStructure)/.test(path) ||
 /src\/services\/__tests__\/(event|campusService.*(structure|event))/.test(path) ||
 /src\/hooks\/__tests__\/use(EventOrganizationAccess|OrganizationEventWorkspace|StudentOrgEventUpdates|AdminEventSubmissions)/.test(path) ||
 /src\/pages\/__tests__\/(StudentMyEventsAccess|StudentEventEditPage|AdminEventLayoutsPage|AdminEventLayoutPreviewPage|AdminEventsWorkspacePage|AdminUsersPage|CampusMapPage.event)/.test(path) ||
 /src\/components\/layout\/__tests__\/(Navbar|AdminLayout.activityNotifications|AdminSidebar.eventSubmissions|OrgEventUpdateBadges|StudentNotificationBell.events)/.test(path) ||
 /src\/components\/map\/__tests__\/(MobileMapAccountMenu|MobileBuildingSheet)/.test(path)
);
const files = paths.filter(relevant).sort();
const output = '.tmp/continuity-unit-full.json';
const args = ['node_modules/vitest/vitest.mjs', 'run', ...files, '--reporter=json', `--outputFile=${output}`, '--maxWorkers=1', '--testTimeout=15000'];
const result = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true });
fs.writeFileSync('.tmp/continuity-unit.log', `${result.stdout || ''}\n${result.stderr || ''}`);
if (result.error) throw result.error;
const full = JSON.parse(fs.readFileSync(output, 'utf8'));
const failures = full.testResults.flatMap(file => file.assertionResults.filter(test => test.status === 'failed').map(test => ({ file: file.name, name: test.fullName, message: test.failureMessages[0]?.split('\n')[0] })));
const suiteErrors = full.testResults.filter(file => file.status === 'failed' && !file.assertionResults.length).map(file => ({ file: file.name, message: file.message }));
const report = { command: `node ${args.join(' ')}`, files, passed: full.numPassedTests, failed: full.numFailedTests, pending: full.numPendingTests, failures, suiteErrors, exitCode: result.status };
fs.writeFileSync('docs/verification/organization-event-continuity/unit-results.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({files:files.length,passed:report.passed,failed:report.failed,pending:report.pending,failures,suiteErrors,exitCode:report.exitCode}));
process.exitCode = result.status || (failures.length ? 1 : 0);
