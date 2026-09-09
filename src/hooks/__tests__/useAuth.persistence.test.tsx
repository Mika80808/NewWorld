// @vitest-environment jsdom
import '../../test/setupDom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const api=vi.hoisted(()=>({upsert:vi.fn(),remove:vi.fn(),session:vi.fn(),listener:vi.fn()}));
vi.mock('../../lib/supabase',()=>({
  isSupabaseConfigured:true,
  supabase:{
    auth:{getSession:api.session,onAuthStateChange:api.listener},
    from:()=>({
      upsert:api.upsert,
      delete:()=>({eq:()=>({eq:api.remove})}),
    }),
  },
}));
vi.stubEnv('VITE_DEV_SKIP_AUTH','false');
const {useAuth}=await import('../useAuth');
const deferred=<T,>()=>{
  let resolve!:(value:T)=>void;
  let reject!:(error:Error)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
};
beforeEach(()=>{
  vi.clearAllMocks();
  api.session.mockResolvedValue({data:{session:null},error:null});
  api.listener.mockReturnValue({data:{subscription:{unsubscribe:vi.fn()}}});
  api.upsert.mockResolvedValue({error:null});
  api.remove.mockResolvedValue({error:null});
});
const settle=async()=>{await act(async()=>{await Promise.resolve();});};

describe('cloud save ordering',()=>{
  it('同槽寫入依序完成，A → B → A 不會因舊快取而跳過最後一次',async()=>{
    const first=deferred<{error:null}>();
    api.upsert.mockReturnValueOnce(first.promise);
    const {result}=renderHook(()=>useAuth());
    const a=result.current.saveToCloud('user','slot',{value:'A'});
    const b=result.current.saveToCloud('user','slot',{value:'B'});
    const again=result.current.saveToCloud('user','slot',{value:'A'});
    await settle();
    expect(api.upsert).toHaveBeenCalledTimes(1);
    first.resolve({error:null});
    await expect(Promise.all([a,b,again])).resolves.toEqual([true,true,true]);
    expect(api.upsert.mock.calls.map(([row])=>row.save_data.value)).toEqual(['A','B','A']);
  });
  it('不同存檔槽不互相阻塞，同槽重複內容只上傳一次',async()=>{
    const first=deferred<{error:null}>();
    api.upsert.mockReturnValueOnce(first.promise);
    const {result}=renderHook(()=>useAuth());
    const a=result.current.saveToCloud('user','a',{value:1});
    const same=result.current.saveToCloud('user','a',{value:1});
    await expect(result.current.saveToCloud('user','b',{value:2})).resolves.toBe(true);
    expect(api.upsert).toHaveBeenCalledTimes(2);
    first.resolve({error:null});
    await Promise.all([a,same]);
    expect(api.upsert).toHaveBeenCalledTimes(2);
  });
  it('刪除等待同槽寫入結束，刪除後相同內容可以重新寫入',async()=>{
    const first=deferred<{error:null}>();
    api.upsert.mockReturnValueOnce(first.promise);
    const {result}=renderHook(()=>useAuth());
    const save=result.current.saveToCloud('user','slot',{value:1});
    const remove=result.current.deleteCloudSave('user','slot');
    await settle();
    expect(api.remove).not.toHaveBeenCalled();
    first.resolve({error:null});
    await Promise.all([save,remove]);
    expect(api.remove).toHaveBeenCalledTimes(1);
    await result.current.saveToCloud('user','slot',{value:1});
    expect(api.upsert).toHaveBeenCalledTimes(2);
  });
  it('寫入失敗不堵住下一筆，排程保留呼叫當時的快照',async()=>{
    api.upsert.mockRejectedValueOnce(new Error('offline'));
    const {result}=renderHook(()=>useAuth());
    const failed=result.current.saveToCloud('user','slot',{value:0});
    const error=expect(failed).resolves.toBe(false);
    const snapshot={value:1};
    const next=result.current.saveToCloud('user','slot',snapshot);
    snapshot.value=99;
    await error;
    await expect(next).resolves.toBe(true);
    expect(api.upsert.mock.calls[1][0].save_data.value).toBe(1);
  });
});

describe('session lifecycle',()=>{
  it('初始 session 讀取失敗會結束 loading 並提供錯誤',async()=>{
    api.session.mockRejectedValue(new Error('offline'));
    const {result}=renderHook(()=>useAuth());
    await settle();
    expect(result.current.authLoading).toBe(false);
    expect(result.current.authError).toBe('offline');
  });
  it('晚到的初始 session 不覆蓋後來的登出事件',async()=>{
    const initial=deferred<{data:{session:{user:{id:string}}},error:null}>();
    api.session.mockReturnValue(initial.promise);
    const {result}=renderHook(()=>useAuth());
    act(()=>api.listener.mock.calls[0][0]('SIGNED_OUT',null));
    initial.resolve({data:{session:{user:{id:'old'}}},error:null});
    await settle();
    expect(result.current.authUser).toBeNull();
    expect(result.current.authLoading).toBe(false);
  });
});
