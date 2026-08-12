import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync("public/arena/index.html", "utf8");
const js = readFileSync("public/arena/community.js", "utf8");
const css = readFileSync("public/arena/arena.css", "utf8");

function tagWithId(source, id) {
  const match = source.match(new RegExp(`<[^>]+\\bid=["']${id}["'][^>]*>`, "i"));
  assert.ok(match, `Expected an element with id=${id}`);
  return match[0];
}

test("Community exposes an accessible native thread and comment dialog", () => {
  const dialog = tagWithId(html, "communityThreadDialog");
  const close = tagWithId(html, "communityThreadDialogClose");
  const status = tagWithId(html, "communityCommentStatus");

  assert.match(dialog, /^<dialog\b/i);
  assert.match(dialog, /\baria-labelledby=["']communityThreadDialogTitle["']/i);
  assert.match(close, /\baria-label=["'][^"']*(?:닫기|close)[^"']*["']/i);
  assert.match(status, /\brole=["']status["']/i);
  assert.match(status, /\baria-live=["']polite["']/i);
  assert.match(status, /\baria-atomic=["']true["']/i);

  assert.match(html, /id=["']communityThreadDetail["']/);
  assert.match(html, /id=["']communityCommentList["']/);
  assert.match(html, /<form\b(?=[^>]*\bid=["']communityCommentForm["'])[^>]*>/i);
  assert.match(html, /<input\b(?=[^>]*\bname=["']threadId["'])(?=[^>]*\btype=["']hidden["'])[^>]*>/i);
  assert.match(html, /<input\b(?=[^>]*\bname=["']parentCommentId["'])(?=[^>]*\btype=["']hidden["'])[^>]*>/i);
  assert.match(html, /<textarea\b(?=[^>]*\bid=["']communityCommentBody["'])(?=[^>]*\bname=["']bodyMarkdown["'])[^>]*>/i);
  assert.match(html, /id=["']communityReplyContext["'][^>]*hidden/i);
  assert.match(html, /id=["']communityReplyCancel["']/i);
});

test("Community thread cards open details and comments can target a thread or parent reply", () => {
  assert.match(js, /data-community-open-thread/);
  assert.match(js, /data-community-reply/);
  assert.match(js, /#communityThreadDialog/);
  assert.match(js, /#communityCommentForm/);
  assert.match(js, /#communityReplyCancel/);

  assert.match(js, /action:\s*["']createForumComment["']/);
  assert.match(js, /threadId/);
  assert.match(js, /parentCommentId/);
  assert.match(js, /bodyMarkdown/);
  assert.match(js, /JSON\.stringify\(\{\s*action:\s*["']createForumComment["'],\s*payload\s*\}\)/s);

  assert.match(js, /forum\s*=\s*result\.snapshot/);
  assert.match(js, /forum\.comments|forum\?\.comments/);
  assert.match(js, /comment\.threadId\s*===/);
  assert.match(js, /comment\.parentCommentId/);
});

test("Comment submission uses the shared progress treatment and keeps busy state accessible", () => {
  assert.match(js, /startProcessStatus\(\s*els\.(?:commentStatus|communityCommentStatus)/s);
  assert.match(js, /finishProcessStatus\(\s*els\.(?:commentStatus|communityCommentStatus)/s);
  assert.match(js, /setFormPending\(\s*els\.(?:commentForm|communityCommentForm),\s*true\s*\)/s);
  assert.match(js, /setFormPending\(\s*els\.(?:commentForm|communityCommentForm),\s*false\s*\)/s);
  assert.match(js, /댓글[^"'`]*(?:확인|등록|반영)/);
});

test("Comment detail remains usable as a responsive mobile sheet", () => {
  assert.match(css, /\.community-thread-dialog\b/);
  assert.match(css, /\.community-comment-list\b/);
  assert.match(css, /\.community-comment-form\b/);
  assert.match(css, /\.community-comment-children\b/);

  const mobile = css.slice(css.indexOf("@media (max-width: 640px)"));
  assert.match(mobile, /\.community-thread-dialog\b/);
  assert.match(mobile, /(?:height|max-height):\s*(?:100dvh|calc\(100(?:d|s|)vh[^;]*\))/);
  assert.match(mobile, /\.community-comment-form[\s\S]*?position:\s*sticky[\s\S]*?bottom:\s*0/);
  assert.match(mobile, /\.community-comment-children[\s\S]*?(?:margin-left|padding-left):\s*(?:0|[0-9.]+px)/);
});
