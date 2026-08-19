import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("public/arena/index.html", "utf8");
const arena = readFileSync("public/arena/arena.js", "utf8");
const market = readFileSync("public/arena/market.js", "utf8");
const community = readFileSync("public/arena/community.js", "utf8");
const css = readFileSync("public/arena/market.css", "utf8");

test("Workspace navigation is replaced by a personal My Log hub", () => {
  assert.match(html, /data-page="workspace"[^>]*data-member-only[^>]*>My Log<\/button>/);
  assert.doesNotMatch(html, /data-page="workspace"[^>]*>Workspace<\/button>/);
  assert.match(html, /data-nav-target="myLogMatches"/);
  assert.match(html, /data-nav-target="myLogCommunity"/);
  assert.match(html, /data-nav-target="myLogBounties"/);
  assert.match(html, /data-nav-target="myLogTimeline"/);
  assert.match(html, /data-nav-target="myLogBriefs"[^>]*data-permission="canViewOperations"/);
  assert.match(html, /id="myLogTimelineList"/);
  assert.match(html, /id="myLogLoadMoreButton"[^>]*>이전 기록 더 불러오기<\/button>/);
  assert.match(html, /id="myLogMatchList"/);
  assert.match(html, /id="myLogCommunityList"/);
  assert.match(html, /id="myLogBountyList"/);
});

test("My Log combines match, Community, and Bounty activity while keeping only the raw staff utility", () => {
  assert.match(market, /function renderMyLogMatches/);
  assert.match(market, /function renderMyLogCommunity/);
  assert.match(market, /function renderMyLogBounties/);
  assert.match(market, /communitySummary\.commentsReceived \+ communitySummary\.likesReceived/);
  assert.match(market, /\["Comments written", communitySummary\.comments, "내가 작성한 댓글"\]/);
  assert.match(market, /function renderWorkspaceMetrics\(metrics\)/);
  assert.match(market, /competition\(\)\.opportunities/);
  assert.match(html, /id="staffUtilityNav"/);
  assert.doesNotMatch(html, /<strong>Program Operations<\/strong>/);
  assert.doesNotMatch(html, /data-nav-page="operations"/);
  assert.doesNotMatch(html, /data-go-page="operations"|>운영 현황<\/button>/);
  assert.match(html, /data-permission="canViewRawDatabase"/);
  assert.match(arena, /if \(pageName === "operations"\) \{[\s\S]*?pageName = "workspace"/);
});

test("Claw Members and partners see authored comments as a distinct My Log metric", () => {
  const authoredCommentMetrics = market.match(/\["Comments written", communitySummary\.comments, "내가 작성한 댓글"\]/g) || [];
  assert.equal(authoredCommentMetrics.length, 2);
  assert.match(market, /--workspace-metric-count/);
  assert.match(css, /repeat\(var\(--workspace-metric-count, 4\), minmax\(0, 1fr\)\)/);
  assert.match(css, /\.workspace-metrics article:nth-child\(5\)[\s\S]*?border-left: 0/);
});

test("My Log removes the legacy weekly report, mentoring, and duplicate review workspace", () => {
  const myLogPage = html.match(/<section id="workspacePage"[\s\S]*?<section id="teamsPage"/)?.[0] || "";
  assert.doesNotMatch(myLogPage, /programWorkspaceDetails|주간 실행 리포트|내 팀 멘토링|collaborationReviewWorkspace/);
  assert.match(myLogPage, /id="myLogMatches"/);
  assert.match(market, /function myLogMatchItemMarkup/);
});

test("SparkLabs Next Actions monitors public discovery Briefs alongside the collaboration audit log", () => {
  const programWorkspace = market.slice(market.indexOf("function renderProgramWorkspace"), market.indexOf("function renderWorkspaceMetrics"));
  assert.match(programWorkspace, /탐색 Brief 접수 확인/);
  assert.match(programWorkspace, /publicBriefCount/);
  assert.match(programWorkspace, /publicBriefLoading/);
  assert.match(programWorkspace, /data-my-log-target/);
  assert.match(programWorkspace, /협업 검토 감사 로그/);
  assert.doesNotMatch(programWorkspace, /팀 운영 현황|베네핏 Queue|일정 RSVP/);
  assert.doesNotMatch(programWorkspace, /프로그램 운영 Queue/);
});

test("public discovery Brief monitoring is rendered only in the SparkLabs My Log", () => {
  assert.match(html, /id="myLogBriefs"[^>]*hidden/);
  assert.match(html, /id="myLogBriefList"/);
  assert.match(market, /function renderMyLogPublicBriefs/);
  assert.match(market, /\["sparklabs", "admin"\]\.includes\(role\)/);
  assert.match(market, /const items = monitor\.items \|\| \[\]/);
  assert.match(market, /els\.myLogBriefList\.innerHTML = items\.length/);
  assert.match(css, /\.my-log-public-brief-panel\s*\{[\s\S]*?grid-column:\s*1 \/ -1/);
});

test("Community publishes a viewer-scoped activity projection to My Log", () => {
  assert.match(community, /spark-arena:load-community-activity/);
  assert.match(community, /publishCommunityActivity\(\)/);
  assert.match(community, /spark-arena:community-activity/);
  assert.match(market, /window\.__sparkArenaCommunityActivity/);
  assert.match(market, /renderWorkspace\(\)/);
});

test("My Log detail panels remain readable on narrow screens", () => {
  assert.match(css, /\.my-log-grid\s*\{/);
  assert.match(css, /\.my-log-panel:hover/);
  assert.match(css, /\.my-log-item\s*\{/);
  assert.match(css, /\.workspace-grid,\s*\.my-log-grid\s*\{\s*grid-template-columns: 1fr/);
});

test("Recent activity is presented as a readable raw log stream", () => {
  assert.match(html, /class="panel workspace-activity-panel"/);
  assert.match(html, /workspace-log-live[\s\S]*?LIVE LOG/);
  assert.match(market, /function workspaceActivityLogMarkup/);
  assert.match(market, /function rawLogTimestamp/);
  assert.match(market, /timeZone: "Asia\/Seoul"/);
  assert.match(market, /source: "COMMUNITY"/);
  assert.match(market, /function renderWorkspaceActivity/);
  assert.match(market, /myLogCanonicalState\.events\.map\(canonicalMyLogRawActivity\)/);
  assert.match(market, /\["idle", "loading"\]\.includes\(myLogCanonicalState\.status\)/);
  const recentActivityRenderer = market.slice(market.indexOf("function renderWorkspaceActivity"), market.indexOf("function canonicalMyLogRawActivity"));
  assert.doesNotMatch(recentActivityRenderer, /\.slice\(0, 8\)/);
  assert.match(recentActivityRenderer, /\[\.\.\.canonicalItems, \.\.\.fallbackItems, \.\.\.supplementalItems\]/);
  assert.match(recentActivityRenderer, /const seen = new Set\(\)/);
  assert.doesNotMatch(recentActivityRenderer, /myLogCanonicalState\.available \? canonicalItems : fallbackItems/);
  assert.match(html, /id="workspaceActivity"[^>]*tabindex="0"[^>]*role="feed"/);
  assert.match(css, /\.workspace-activity\s*\{[\s\S]*?max-height:\s*420px;[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /\.workspace-activity:focus-visible/);
  assert.doesNotMatch(market, /source: "REPORT"/);
  assert.doesNotMatch(market, /source: "PERK"/);
  assert.doesNotMatch(market, /source: "EVENT"/);
  assert.doesNotMatch(market, /hub\.eventRegistrations/);
  assert.doesNotMatch(market, /hub\.benefitApplications/);
  assert.doesNotMatch(market, /hub\.weeklyReports/);
  assert.match(css, /\.workspace-activity\s*\{[\s\S]*?font-family:[^;]*monospace/);
  assert.match(css, /content: "stdout \/ activity\.stream \/ newest_first"/);
  assert.match(css, /\.workspace-activity article\s*\{[\s\S]*?grid-template-columns: 3ch 19ch 12ch minmax\(0, 1fr\) auto/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.workspace-log-line strong/);
});

test("staff Recent Activity stays personal and excludes operational intake monitoring", () => {
  const programWorkspace = market.slice(market.indexOf("function renderProgramWorkspace"), market.indexOf("function workspaceActionMarkup"));
  const timelineRenderer = market.slice(market.indexOf("function renderMyLogTimeline"), market.indexOf("async function loadCanonicalMyLog"));
  assert.match(programWorkspace, /renderWorkspaceActivity\(recent\)/);
  assert.doesNotMatch(programWorkspace, /renderWorkspaceActivity\(recent, publicBriefActivity\)/);
  assert.doesNotMatch(programWorkspace, /title: `\$\{item\.organization \|\| "외부 기업"\} 탐색 Brief 접수`/);
  assert.match(programWorkspace, /!staff \? collaborationReviews\.map/);
  assert.match(programWorkspace, /collaborationReviews: staff \? \[\] : collaborationReviews/);
  assert.match(programWorkspace, /connections: staff \? \[\] : connections/);
  assert.match(programWorkspace, /bountyRequests: staff \? \[\] : bountyRequests/);
  assert.doesNotMatch(timelineRenderer, /publicBriefs/);
  assert.doesNotMatch(timelineRenderer, /sourceSystem: "public_brief"/);
});

test("My Log exposes one reverse-chronological activity window with source filters", () => {
  assert.match(html, /ACTIVITY TIMELINE · NEWEST FIRST/);
  assert.match(html, /data-my-log-timeline-filter="all"/);
  assert.match(html, /data-my-log-timeline-filter="discover"/);
  assert.match(html, /data-my-log-timeline-filter="community"/);
  assert.match(html, /data-my-log-timeline-filter="bounty"/);
  assert.match(market, /function renderMyLogTimeline/);
  assert.match(market, /myLogActivityTime\(right\.at\) - myLogActivityTime\(left\.at\)/);
  assert.match(market, /renderMyLogTimelineItems/);
  assert.match(market, /handleMyLogTimelineFilter/);
  assert.match(css, /\.my-log-timeline-list\s*\{[\s\S]*?max-height:\s*520px;[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /\.my-log-timeline-item:hover,[\s\S]*?\.my-log-timeline-item:focus-visible/);
});

test("My Log merges authenticated canonical activity with the legacy fallback", () => {
  assert.match(market, /const requestUrl = append[\s\S]*?"\/api\/my-log\?limit=100"/);
  assert.match(market, /fetch\(requestUrl,\s*\{[\s\S]*?method: "GET"/);
  assert.match(market, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(market, /result\?\.available === true/);
  assert.match(market, /mergeMyLogTimelineItems\(canonicalItems, \[\.\.\.discoverItems, \.\.\.communityItems, \.\.\.bountyItems\]\)/);
  assert.match(market, /myLogSourceKey\(item\)/);
  assert.match(market, /JSON\.stringify\(\[sourceSystem, sourceEventId\]\)/);
  assert.match(market, /sourceSystem: "program_actions"/);
  assert.match(market, /sourceSystem: "arena"/);
  assert.match(market, /sourceSystem: "forum"/);
  assert.match(market, /sourceSystem: "competition"/);
  assert.match(market, /sourceEventId: item\.id/);
});

test("My Log loads older canonical pages through the opaque cursor", () => {
  assert.match(market, /\/api\/my-log\?limit=100&cursor=\$\{encodeURIComponent\(existingState\.nextCursor\)\}/);
  assert.match(market, /nextCursor: available \? result\?\.nextCursor \|\| null : null/);
  assert.match(market, /mergeCanonicalMyLogEvents\(existingState\.events, incomingEvents\)/);
  assert.match(market, /loadCanonicalMyLog\(\{ append: true \}\)/);
  assert.match(market, /requestId !== myLogCanonicalRequestId \|\| identity !== viewerIdentity\(viewer\(\)\)/);
});

test("My Log canonical activity resets and ignores stale responses after an account switch", () => {
  assert.match(market, /resetCanonicalMyLog\(nextViewerIdentity\)/);
  assert.match(market, /myLogCanonicalRequestId \+= 1/);
  assert.match(market, /requestId !== myLogCanonicalRequestId \|\| identity !== viewerIdentity\(viewer\(\)\)/);
  assert.match(market, /\.\.\.emptyCanonicalMyLogState\(identity\),\s*status: "error"/);
});
