import {env} from 'process';
import path from 'path';
import {extractUsers, postMessage, mergeMappingFile, extractMessageParts} from '../src/main';
import {readFile} from 'fs/promises';

function testFile(file: string): string {
  return path.join(__dirname, 'testdata', file);
}

test('test mergeMappingFile', done => {
  (async () => {
    expect(await mergeMappingFile({mechiru1: '[To:123]@mechiru'}, testFile('mapping.json'))).toStrictEqual({
      mechiru: '[To:123]@mechiru',
      'organization/team': '[To:123]@mechiru [To:124]@suzuki',
      mechiru1: '[To:123]@mechiru'
    });
    done();
  })();
});

test('test extractUsers', () => {
  [
    {in: '', want: ''},
    {in: '@mechiru', want: 'mechiru'},
    {in: '@mechiru hi', want: 'mechiru'},
    {in: '@Mechiru', want: 'Mechiru'},
    {in: '@-mechiru', want: ''},
    {in: '@mechiru-', want: 'mechiru'},
    {in: '@@', want: ''},
    {in: '@mechiru- @mechiru-', want: 'mechiru'},
    {in: '@mechiru\n@Mechiru\n@mechirU', want: 'mechiru Mechiru mechirU'},
    {in: '@山田', want: ''},
    {in: '@org/team', want: 'org/team'},
    {in: '@org/-team', want: 'org'},
    {in: '@org/team-', want: 'org/team'},
    {in: '@org/team/child', want: 'org/team'}
  ].forEach(x => expect(extractUsers(x.in).join(' ')).toBe(x.want));
});

test('test extractMessageParts', done => {
  (async () => {
    const tests = [
      // discussion
      {
        file: 'discussion_created.json',
        want: {
          title: 'new discussion2',
          body: 'discussion 2 body',
          logins: [],
          url: 'https://github.com/mechiru/github-actions-playground/discussions/7'
        }
      },
      {
        file: 'discussion_edited.json',
        want: {
          title: 'new discussion2',
          body: 'discussion 2 body\r\nedited',
          logins: [],
          url: 'https://github.com/mechiru/github-actions-playground/discussions/7'
        }
      },
      {
        file: 'discussion_answered.json',
        want: {
          title: 'new discussion',
          body: 'fuga',
          logins: [],
          url: 'https://github.com/mechiru/github-actions-playground/discussions/6#discussioncomment-6159642'
        }
      },
      // discussion comment
      {
        file: 'discussion_comment_created.json',
        want: {
          title: 'new discussion2',
          body: 'discussion comment create body',
          logins: [],
          url: 'https://github.com/mechiru/github-actions-playground/discussions/7#discussioncomment-6159597'
        }
      },
      {
        file: 'discussion_comment_edited.json',
        want: {
          title: 'new discussion2',
          body: 'discussion comment create body\r\nedited',
          logins: [],
          url: 'https://github.com/mechiru/github-actions-playground/discussions/7#discussioncomment-6159597'
        }
      },
      // issues
      {
        file: 'issues_opened.json',
        want: {
          title: 'issue create',
          body: 'issue creation text body',
          logins: ['mechiru'],
          url: 'https://github.com/mechiru/github-actions-playground/issues/5'
        }
      },
      {
        file: 'issues_edited.json',
        want: {
          title: 'issue create',
          body: 'issue creation text body\r\nedited',
          logins: ['mechiru'],
          url: 'https://github.com/mechiru/github-actions-playground/issues/5'
        }
      },
      // issue comment
      {
        file: 'issue_comment_created.json',
        want: {
          title: 'issue create',
          body: 'issue comment creation body',
          logins: [],
          url: 'https://github.com/mechiru/github-actions-playground/issues/5#issuecomment-1588599039'
        }
      },
      {
        file: 'issue_comment_edited.json',
        want: {
          title: 'issue create',
          body: 'issue comment creation body\r\nedited',
          logins: [],
          url: 'https://github.com/mechiru/github-actions-playground/issues/5#issuecomment-1588599039'
        }
      },
      // pull request
      {
        file: 'pull_request_opened.json',
        want: {
          title: 'Commit for trigger test',
          body: 'create pr test',
          logins: ['mechiru'],
          url: 'https://github.com/mechiru/github-actions-playground/pull/8'
        }
      },
      {
        file: 'pull_request_edited.json',
        want: {
          title: 'Commit for trigger test',
          body: 'create pr test\r\n\r\nedited',
          logins: ['mechiru'],
          url: 'https://github.com/mechiru/github-actions-playground/pull/8'
        }
      }
    ].map(async c => {
      const file = await readFile(testFile(c.file), {encoding: 'utf8'});
      const context = JSON.parse(file);
      expect(extractMessageParts(context)).toStrictEqual(c.want);
    });
    await Promise.all(tests);
    done();
  })();
});

test('test postMessage', done => {
  (async () => {
    const res = await postMessage(
      {token: env['CHATWORK_API_TOKEN']!, roomId: +env['CHATWORK_ROOM_ID']!},
      'Hello Chatwork!'
    );
    expect(res.message_id).not.toBeNull();
    done();
  })();
});
