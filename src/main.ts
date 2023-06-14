import * as core from '@actions/core';
import {readFile} from 'fs/promises';
import * as https from 'https';
import * as querystring from 'querystring';

type Input = Readonly<{
  roomId: number;
  token: string;
  mapping: Mapping;
  mappingFile: string;
  context: GitHubContext;
  ignoreBody: boolean;
  skipSendingMessage: boolean;
}>;

type Mapping = {[key: string]: string | null};

// https://docs.github.com/en/actions/learn-github-actions/contexts#github-context
type GitHubContext =
  | DiscussionCreated
  | DiscussionEdited
  | DiscussionAnswered
  | DiscussionCommentCreated
  | DiscussionCommentEdited
  | IssuesOpened
  | IssuesEdited
  | IssueCommentCreated
  | IssueCommentEdited
  | PullRequestOpened
  | PullRequestEdited;

type Context<EventName, Event> = Readonly<{
  actor: string;
  event_name: EventName;
  event: Event;
}>;

type Comment = Readonly<{
  body: string;
  html_url: string;
}>;

// === discussion ===
// https://docs.github.com/en/webhooks-and-events/webhooks/webhook-events-and-payloads#discussion

type Discussion = Readonly<{
  title: string;
  body: string;
  user: {login: string};
  html_url: string;
}>;

type DiscussionCreated = Context<
  'discussion',
  {
    action: 'created';
    discussion: Discussion;
  }
>;

type DiscussionEdited = Context<
  'discussion',
  {
    action: 'edited';
    discussion: Discussion;
  }
>;

type DiscussionAnswered = Context<
  'discussion',
  {
    action: 'answered';
    answer: {
      body: string;
      html_url: string;
    };
    discussion: Discussion;
  }
>;

// === discussion comment ===
// https://docs.github.com/en/webhooks-and-events/webhooks/webhook-events-and-payloads#discussion_comment

type DiscussionCommentCreated = Context<
  'discussion_comment',
  {
    action: 'created';
    comment: Comment;
    discussion: Discussion;
  }
>;

type DiscussionCommentEdited = Context<
  'discussion_comment',
  {
    action: 'edited';
    comment: Comment;
    discussion: Discussion;
  }
>;

// === issues ===
// https://docs.github.com/en/webhooks-and-events/webhooks/webhook-events-and-payloads#issues

type Issue = Readonly<{
  title: string;
  body: string;
  assignees: {login: string}[];
  html_url: string;
}>;

type IssuesOpened = Context<
  'issues',
  {
    action: 'opened';
    issue: Issue;
  }
>;

type IssuesEdited = Context<
  'issues',
  {
    action: 'edited';
    issue: Issue;
  }
>;

// === issue comment ===
// https://docs.github.com/en/webhooks-and-events/webhooks/webhook-events-and-payloads#issue_comment

type IssueCommentCreated = Context<
  'issue_comment',
  {
    action: 'created';
    comment: Comment;
    issue: Issue;
  }
>;

type IssueCommentEdited = Context<
  'issue_comment',
  {
    action: 'edited';
    comment: Comment;
    issue: Issue;
  }
>;

// === pull request ===
// https://docs.github.com/en/webhooks-and-events/webhooks/webhook-events-and-payloads#pull_request

type PullRequest = Issue &
  Readonly<{
    requested_reviewers: {login: string}[];
    // TODO: requested_teams: string[],
  }>;

type PullRequestOpened = Context<
  'pull_request',
  {
    action: 'opened';
    pull_request: PullRequest;
  }
>;

type PullRequestEdited = Context<
  'pull_request',
  {
    action: 'edited';
    pull_request: PullRequest;
  }
>;

function parseInput(): Input {
  const roomId = +core.getInput('roomid');
  const token = core.getInput('token');
  const mapping = JSON.parse(core.getInput('mapping'));
  const mappingFile = core.getInput('mappingFile');
  const context = JSON.parse(core.getInput('context'));
  const ignoreBody = core.getBooleanInput('ignoreBody');
  const skipSendingMessage = core.getBooleanInput('skipSendingMessage');
  return {roomId, token, mapping, mappingFile, context, ignoreBody, skipSendingMessage};
}

async function mergeMappingFile(mapping: Mapping, mappingFile: string): Promise<Mapping> {
  if (mappingFile === '') {
    return mapping;
  }

  const file = await readFile(mappingFile, {encoding: 'utf8'});
  const data = JSON.parse(file) as Mapping;
  for (const key in mapping) {
    data[key] = mapping[key];
  }
  return data;
}

export function extractUsers(s: string): string[] {
  const ret: string[] = [];
  const chars = [...s] as const;
  let i = 0;
  while (i < chars.length) {
    const c = chars[i++];
    if (c !== '@') continue;
    if (i < chars.length) {
      const c = chars[i];
      if (!isAlphaNumeric(c)) continue;
      const buf: string[] = [];
      buf.push(c);
      while (++i < chars.length) {
        const c = chars[i];
        const isHyphen = c === '-';
        const isSlash = c === '/';
        if (!(isHyphen || isSlash || isAlphaNumeric(c))) break;
        const hasNext = i + 1 < s.length ? isAlphaNumeric(s[i + 1]) : false;
        if (isHyphen && !hasNext) break;
        if (isSlash && (!hasNext || buf.includes('/'))) break;
        buf.push(c);
      }
      const name = buf.join('');
      if (!ret.includes(name)) ret.push(name);
    }
  }
  return ret;
}

function isAlphaNumeric(s: string): boolean {
  return /^[a-z0-9]+$/i.test(s);
}

function toChatworkUsers(ghUsers: string[], map: Mapping): string[] {
  return ghUsers.map(x => map[x]).filter((x: string | null): x is string => x != null);
}

/* eslint-disable @typescript-eslint/promise-function-async */
export function postMessage(
  cw: {token: string; roomId: number},
  body: string
): Promise<Readonly<{message_id: string}>> {
  return new Promise((resolve, reject) => {
    const opts: https.RequestOptions = {
      hostname: 'api.chatwork.com',
      port: 443,
      path: `/v2/rooms/${cw.roomId}/messages`,
      method: 'POST',
      headers: {
        'X-ChatWorkToken': cw.token,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    };
    const req = https.request(opts, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`status code error. status code: ${res.statusCode}`));
      }
      res.setEncoding('utf8');
      let body = '';
      res.on('data', chunk => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.write(`body=${querystring.escape(body)}`, error => {
      if (error != null) reject(error);
    });
    req.end();
  });
}
/* eslint-enable @typescript-eslint/promise-function-async */

export function extractMessageParts(
  ctx: GitHubContext
): Readonly<{title: string; body: string; logins: string[]; url: string}> {
  switch (ctx.event_name) {
    case 'discussion':
      return {
        title: ctx.event.discussion.title,
        body: ctx.event.discussion.body,
        logins: [],
        url: ctx.event.discussion.html_url
      };
    case 'discussion_comment':
      return {
        title: ctx.event.discussion.title,
        body: ctx.event.comment.body,
        logins: [],
        url: ctx.event.comment.html_url
      };
    case 'issues':
      return {
        title: ctx.event.issue.title,
        body: ctx.event.issue.body,
        logins: ctx.event.issue.assignees.map(x => x.login),
        url: ctx.event.issue.html_url
      };
    case 'issue_comment':
      return {
        title: ctx.event.issue.title,
        body: ctx.event.comment.body,
        logins: [],
        url: ctx.event.comment.html_url
      };
    case 'pull_request':
      return {
        title: ctx.event.pull_request.title,
        body: ctx.event.pull_request.body,
        logins: ctx.event.pull_request.assignees.concat(ctx.event.pull_request.requested_reviewers).map(x => x.login),
        url: ctx.event.pull_request.html_url
      };
  }
}

export function toChatworkMessage(ctx: GitHubContext, map: Mapping, minimum: boolean): [boolean, string] {
  const {title, body, logins, url} = extractMessageParts(ctx);
  let users = extractUsers(body)
    .concat(logins)
    .filter((x, i, xs) => xs.indexOf(x) === i);
  const foundUser = users.length > 0;
  const cwUsers = toChatworkUsers(users, map);

  let message = '';
  if (cwUsers.length > 0) message += `${cwUsers.join('\n')}\n`;
  message += `from: @${ctx.actor}
title: ${title}
url: ${url}
`;
  // TODO: Convert to chatwork message style.
  if (!minimum) message += `\n${body}`;
  return [foundUser, message];
}

async function run(): Promise<void> {
  try {
    const input = parseInput();
    core.debug(`event_name: ${input.context.event_name}`);
    core.debug(`event.action: ${JSON.stringify(input.context.event.action)}`);

    const mapping = await mergeMappingFile(input.mapping, input.mappingFile);
    core.debug(`mapping: ${JSON.stringify(mapping)}`);

    const [foundUser, body] = toChatworkMessage(input.context, mapping, input.ignoreBody);
    core.debug(`message body: ${body}`);

    if (input.skipSendingMessage && !foundUser) {
      core.debug('skip sending message');
      return;
    }

    const res = await postMessage(input, body);
    core.debug(`response: ${res}`);

    core.setOutput('messageId', res.message_id);
  } catch (error) {
    if (typeof error === 'string') {
      core.setFailed(error);
    } else if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed(Object.prototype.toString.call(error));
    }
  }
}

run();
