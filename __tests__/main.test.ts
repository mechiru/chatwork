import * as process from 'process';
import path from 'path';
import {extractUsers, postMessage, mergeMappingFile} from '../src/main';

test('test mergeMappingFile', done => {
  (async () => {
    const filepath = path.join(__dirname, 'testdata/mapping.json');
    expect(await mergeMappingFile({mechiru1: '[To:123]@mechiru'}, filepath)).toStrictEqual({
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
      {token: process.env['CHATWORK_API_TOKEN']!, roomId: +process.env['CHATWORK_ROOM_ID']!},
      'Hello Chatwork!'
    );
    expect(res.message_id).not.toBeNull();
    done();
  })();
});
