import * as core from '@actions/core';
import * as https from 'https';
import * as querystring from 'querystring';

type Input = Readonly<{
  roomId: number;
  token: string;
  mapping: Mapping;
  context: Context;
  ignoreBody: boolean;
}>;

type Mapping = {[key: string]: string | null};

// https://docs.github.com/en/free-pro-team@latest/actions/reference/context-and-expression-syntax-for-github-actions#github-context
type Context = Readonly<{
  actor: string;
  event_name: 'issues' | 'issue_comment';
  // https://developer.github.com/webhooks/event-payloads/#issues
  // https://developer.github.com/webhooks/event-payloads/#issue_comment
  // created, edited or deleted
  event: Readonly<{
    // issues: opened or edited
    // issue_comment: created or edited
    action: string;
    comment?: Readonly<{
      html_url: string;
      body: string;
    }>;
    issue: Readonly<{
      html_url: string;
      assignees: Readonly<{login: string}[]>;
      title: string;
      body: string;
    }>;
  }>;
}>;

function parseInput(): Input {
  const roomId = +core.getInput('roomid');
  const token = core.getInput('token');
  const mapping = JSON.parse(core.getInput('mapping'));
  const context = JSON.parse(core.getInput('context'));
  const ignoreBody = core.getInput('ignoreBody') === 'true';
  return {roomId, token, mapping, context, ignoreBody};
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

function mapToChatworkUser(ghUsers: string[], map: Mapping): string[] {
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

export function toChatworkMessage(ctx: Context, map: Mapping, ignoreBody: boolean): string {
  const title = ctx.event.issue.title;
  const isComment = ctx.event_name === 'issue_comment';
  const url = isComment ? ctx.event.comment!.html_url : ctx.event.issue.html_url;
  const eventBody = isComment ? ctx.event.comment!.body : ctx.event.issue.body;
  let ghUsers = extractUsers(eventBody);
  if (!isComment) {
    const assignees = ctx.event.issue.assignees.map(x => x.login);
    ghUsers = ghUsers.concat(assignees).filter((x, i, xs) => xs.indexOf(x) === i);
  }
  const users = mapToChatworkUser(ghUsers, map);

  let msg = users.length > 0 ? `${users.join('\n')}\n` : '';
  msg += `title: ${title}
url: ${url}
`;
  // TODO: Convert to chatwork message style.
  if (!ignoreBody) msg += `\n${eventBody}`;
  return msg;
}

async function run(): Promise<void> {
  try {
    const input = parseInput();
    core.debug(`event_name: ${input.context.event_name}`);
    core.debug(`event.action: ${JSON.stringify(input.context.event.action)}`);

    const body = toChatworkMessage(input.context, input.mapping, input.ignoreBody);
    core.debug(`message body: ${body}`);

    const res = await postMessage(input, body);
    core.debug(`response: ${res}`);

    core.setOutput('messageId', res.message_id);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
