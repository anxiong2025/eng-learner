export const onRequest: PagesFunction = async (context) => {
  const url = new URL(context.request.url);
  const target = `https://eng-learner-api.xiaoxiongxiao2.workers.dev${url.pathname}${url.search}`;

  const request = new Request(target, {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.body,
  });

  return fetch(request);
};
