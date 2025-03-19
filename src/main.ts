import * as core from '@actions/core';
import {readFile} from 'fs/promises';
import * as https from 'https';
import * as querystring from 'querystring';

type Input = Readonly<{
  roomId: number;
  token: string;
  mapping: Mapping;
  mappingFile: string;
  context: Context;
  ignoreBody: boolean;
  skipSendingMessage: boolean;
}>;

type Mapping = {[key: string]: string | null};

const EventName = {
  issues: 'issues',
  issueComment: 'issue_comment',
  discussion: 'discussion',
  discussionComment: 'discussion_comment',
  pullRequest: 'pull_request'
} as const;

type EventNames = (typeof EventName)[keyof typeof EventName];

type Context = IssuesContext | IssueCommentContext | DiscussionContext | DiscussionCommentContext | PullRequestContext;

// https://docs.github.com/free-pro-team@latest/actions/reference/context-and-expression-syntax-for-github-actions#github-context
type ContextBase<T extends EventNames, U extends {}> = Readonly<{
  actor: string;
  event_name: T;
  event: Readonly<U>;
}>;

// https://docs.github.com/rest/issues/issues?apiVersion=2022-11-28#get-an-issue
type Issue = Readonly<{
  html_url: string;
  assignees?: Readonly<{login: string}[]>;
  title: string;
  body: string;
}>;

// https://docs.github.com/webhooks/webhook-events-and-payloads#issue_comment
type IssuesContext = ContextBase<
  typeof EventName.issues,
  {
    action: 'opened' | 'edited' | 'reopened';
    issue: Issue;
  }
>;

// https://developer.github.com/webhooks/event-payloads/#issue_comment
type IssueCommentContext = ContextBase<
  typeof EventName.issueComment,
  {
    action: 'created' | 'edited';
    // https://docs.github.com/rest/issues/comments?apiVersion=2022-11-28#get-an-issue-comment
    comment: Readonly<{
      html_url: string;
      body: string;
    }>;
    issue: Issue;
  }
>;

type Discussion = Readonly<{
  html_url: string;
  title: string;
  body: string;
}>;

// https://docs.github.com/webhooks/webhook-events-and-payloads#discussion
type DiscussionContext = ContextBase<
  typeof EventName.discussion,
  {
    action: 'created' | 'edited' | 'reopened';
    discussion: Discussion;
  }
>;

// https://docs.github.com/webhooks/webhook-events-and-payloads#discussion_comment
type DiscussionCommentContext = ContextBase<
  typeof EventName.discussionComment,
  {
    action: 'created' | 'edited';
    comment: Readonly<{
      html_url: string;
      body: string;
    }>;
    discussion: Discussion;
  }
>;

// https://docs.github.com/webhooks/webhook-events-and-payloads#pull_request
type PullRequestContext = ContextBase<
  typeof EventName.pullRequest,
  {
    action: 'opened' | 'edited' | 'reopened';
    pull_request: Readonly<{
      html_url: string;
      assignees?: Readonly<{login: string}[]>;
      requested_reviewers?: Readonly<{login: string}>[];
      requested_teams?: Readonly<{slug: string}>[];
      title: string;
      body: string;
    }>;
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

export async function mergeMappingFile(mapping: Mapping, mappingFile: string): Promise<Mapping> {
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

export function extractMessageParts(ctx: Context): {title: string; body: string; url: string; logins: string[]} {
  let title = '';
  let body = '';
  let url = '';
  let logins: string[] = [];

  switch (ctx.event_name) {
    case EventName.issues:
      title = ctx.event.issue.title;
      body = ctx.event.issue.body;
      url = ctx.event.issue.html_url;
      logins = ctx.event.issue.assignees?.map(x => x.login) ?? [];
      break;
    case EventName.issueComment:
      title = ctx.event.issue.title;
      body = ctx.event.comment.body;
      url = ctx.event.comment.html_url;
      break;
    case EventName.discussion:
      title = ctx.event.discussion.title;
      body = ctx.event.discussion.body;
      url = ctx.event.discussion.html_url;
      break;
    case EventName.discussionComment:
      title = ctx.event.discussion.title;
      body = ctx.event.comment.body;
      url = ctx.event.comment.html_url;
      break;
    case EventName.pullRequest: {
      const pr = ctx.event.pull_request;
      title = pr.title;
      body = pr.body;
      url = pr.html_url;
      const assignees = pr.assignees?.map(x => x.login) ?? [];
      const reviewers = pr.requested_reviewers?.map(x => x.login) ?? [];
      const teams = pr.requested_teams?.map(x => x.slug) ?? [];
      logins = assignees.concat(reviewers, teams);
      break;
    }
    default:
  }

  return {title, body, url, logins};
}

export function toChatworkMessage(ctx: Context, map: Mapping, minimum: boolean): [boolean, string] {
  const {title, body, url, logins} = extractMessageParts(ctx);
  const users = logins.concat(extractUsers(body)).filter((x, i, xs) => xs.indexOf(x) === i)n;
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
