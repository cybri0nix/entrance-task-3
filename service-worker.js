'use strict';
/**
 * @file
 * Сервис-воркер, обеспечивающий оффлайновую работу избранного
 */

/**
 Избранное сохраняется в indexedDB
 под ключом: Key:"favorites:NzeQYvVLbZFE4"
 value: "{
             "id": "NzeQYvVLbZFE4",
             "width": 200,
             "height": 150,
             "sources": [{
                 "url": "https: //media0.giphy.com/media/NzeQYvVLbZFE4/200w.webp",
                 "type": "image/webp"
             }],
             "fallback": "https://media0.giphy.com/media/NzeQYvVLbZFE4/200w.gif"
        }"


 */


const CACHE_VERSION = '1.0.0-broken';

importScripts('vendor/kv-keeper.js-1.0.4/kv-keeper.js');


self.addEventListener('install', event => {

    const promise = preCacheAllFavorites()  // Взять все ссылки на гифки из избранного и попытаться их скачать
        // Вопрос №1: зачем нужен этот вызов?
        .then(() => self.skipWaiting())

        // Этот метот позволит насильно устанавливить текущий воркер,
        // не дожидаясь пока не будут закрыты (или обновлены) страницы, на которых уже работает старый воркер.
        // Вызов этого метода приведет к вызову события onactivate

        .then(() => console.log('[ServiceWorker] Installed!'));

    event.waitUntil(promise);
});

self.addEventListener('activate', event => {

    const promise = deleteObsoleteCaches()
        .then(() => {
            // Вопрос №2: зачем нужен этот вызов?
            self.clients.claim();
            // Позволяет установить воркер как активный (активировать) на всех открытых
            // страницах того же scope'а (в котором serviceworker) без переоткрытия/перезагрузки страницы

            console.log('[ServiceWorker] Activated!');
        });

    event.waitUntil(promise);
});




self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Вопрос №3: для всех ли случаев подойдёт такое построение ключа?
    const cacheKey = url.origin + url.pathname;

    // console.log("cacheKey: ", cacheKey);

    let response;

    // Если запрашивается статика, то пробуем взять из кеша,
    // если в кеше нет, то пытаемся скачать, а затем закешировать
    if (needStoreForOffline(cacheKey)) {
        response = caches.match(cacheKey)
            .then(cacheResponse => {
                return cacheResponse || fetchAndPutToCache(cacheKey, event.request)
            });

    } else {
        // Иначе, если запрашивается не статика, то
        // скачиваем ресурс
        response = fetchWithFallbackToCache(event.request);
    }

    event.respondWith(response);
});



self.addEventListener('message', event => {
    const promise = handleMessage(event.data);

    event.waitUntil(promise);
});


// Положить в новый кеш все добавленные в избранное картинки
function preCacheAllFavorites() {
    return getAllFavorites() // Вернет список ссылок на все гифки из избранного (включая фоллбэки на webp)
        .then(urls => Promise.all(
            urls.map(url => fetch(url))) // Каждый ресурс (картинку) пытаемся загрузить по сети
        )
        // Загруженные картинки пытаемся закешировать
        .then(responses => {
            // console.log("responses: ", responses);
            return caches.open(CACHE_VERSION)
                .then(cache => {
                    return Promise.all(
                        // Пытаемся каждую картинку поместить в кеш по ключу { Ссылка на ресурс : Ответ }
                        responses.map(response => cache.put(response.url, response))
                    );
                });
        });
}

// Извлечь из БД добавленные в избранное картинки
function getAllFavorites() {
    return new Promise((resolve, reject) => {

        // Достать все объекты из БД
        KvKeeper.getKeys((err, keys) => {
            if (err) {
                return reject(err);
            }
            // Выбрать из них только объекты - Избранные гифки,
            // и положить только IDшники гифок в массив ids
            const ids = keys
                .filter(key => key.startsWith('favorites:'))
                // 'favorites:'.length == 10
                // Т.к. там ключи вида favorites:dgdfgdfgsdf, то надо отрезать слово favorites: из ключа, тогда останется только id картинки
                .map(key => key.slice(10));


            // Сгруппировать ссылки на ресурсы .gif / .webp для каждой гифки
            Promise.all(ids.map(getFavoriteById))
                .then(urlGroups => {
                    // Объединить ссылки на гифки и webp фоллбэки в один массив
                    return urlGroups.reduce((res, urls) => res.concat(urls), []);
                })
                .then(resolve, reject);
        });
    });
}

// Извлечь из БД запись о картинке
function getFavoriteById(id) {
    return new Promise((resolve, reject) => {
        KvKeeper.getItem('favorites:' + id, (err, val) => {
            if (err) {
                return reject(err);
            }

            const data = JSON.parse(val);
            const images = [data.fallback].concat(data.sources.map(item => item.url));

            resolve(images);
        });
    });
}

// Удалить неактуальный кеш
function deleteObsoleteCaches() {
    return caches.keys()
        .then(names => {
            // Вопрос №4: зачем нужна эта цепочка вызовов?
            // Удалить старый кеш (старый - это отличный от текущей версии)
            return Promise.all(
                names.filter(name => name !== CACHE_VERSION)
                    .map(name => {
                        console.log('[ServiceWorker] Deleting obsolete cache:', name);
                        return caches.delete(name);
                    })
            );
        });
}

// Нужно ли при скачивании сохранять ресурс для оффлайна?
function needStoreForOffline(cacheKey) {
    return cacheKey.includes('vendor/') ||
        cacheKey.includes('assets/') ||
        cacheKey.endsWith('jquery.min.js');
}

// Скачать и добавить в кеш
function fetchAndPutToCache(cacheKey, request) {
    return fetch(request)
        .then(response => {
            return caches.open(CACHE_VERSION)
                .then(cache => {
                    // Вопрос №5: для чего нужно клонирование?
                    // Опираясь только на то, что написано тут ()
                    // https://developer.mozilla.org/ru/docs/Web/API/Service_Worker_API/Using_Service_Workers
                    //
                    // Выдержка из туториала:
                    // "Клон помещается в кеш, а оригинальный ответ передается браузеру, который передает его странице,
                    // которая запросила ресурс.
                    // Почему? Потому, что потоки запроса и ответа могут быть прочитаны только единожды. Чтобы ответ был
                    // получен браузером и сохранен в кеше — нам нужно клонировать его. Так, оригинальный объект
                    // отправится браузеру, а клон будет закеширован. Оба они будут прочитаны единожды."
                    //
                    // Честно, этот момент я не совсем понял, т.к. пробовал читать response перед клонированием, но
                    // никаких исключительных ситуаций не происходило

                    cache.put(cacheKey, response.clone());
                })
                .then(() => response);
        })
        .catch(err => {
            console.error('[ServiceWorker] Fetch error:', err);
            return caches.match(cacheKey);
        });
}

// Попытаться скачать, при неудаче обратиться в кеш
function fetchWithFallbackToCache(request) {
    return fetch(request) // Пробуем скачать ресурс

        // СЛИШКОМ ДОРОГО, кешировать картинку всегда
        .then(response => {
            return caches.open(CACHE_VERSION)
                .then(cache => {
                    console.log("Cached: ", request.url);
                    cache.put(request.url, response.clone());
                })
                .then(() => response);
        })
        .catch(() => {
            // В случае неудачи, пытаемся отдать ресурс из кеша
            console.log('[ServiceWorker] Fallback to offline cache:', request.url);
            return caches.match(request.url);
        });
}

// Обработать сообщение от клиента
const messageHandlers = {
    'favorite:add': handleFavoriteAdd
};

function handleMessage(eventData) {
    const message = eventData.message;
    const id = eventData.id;
    const data = eventData.data;

    console.log('[ServiceWorker] Got message:', message, 'for id:', id);

    const handler = messageHandlers[message];
    return Promise.resolve(handler && handler(id, data));
}

// Обработать сообщение о добавлении новой картинки в избранное
function handleFavoriteAdd(id, data) {
    return caches.open(CACHE_VERSION)
        .then(cache => {
            const urls = [].concat(
                data.fallback,
                (data.sources || []).map(item => item.url)
            );

            return Promise
                .all(
                    urls.map(url => fetch(url))
                )
                .then(responses => {
                    return Promise.all(
                        responses.map(response => cache.put(response.url, response))
                    );
                });
        });
}
