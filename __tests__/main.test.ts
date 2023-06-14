import {env} from 'process';
import path from 'path';
import {extractUsers, postMessage, mergeMappingFile} from '../src/main';

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
