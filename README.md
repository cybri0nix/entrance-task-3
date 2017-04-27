# Задание 3

Мобилизация.Гифки – сервис для поиска гифок в перерывах между занятиями.

Сервис написан с использованием [bem-components](https://ru.bem.info/platform/libs/bem-components/5.0.0/).

Работа избранного в оффлайне реализована с помощью технологии [Service Worker](https://developer.mozilla.org/ru/docs/Web/API/Service_Worker_API/Using_Service_Workers).

Для поиска изображений используется [API сервиса Giphy](https://github.com/Giphy/GiphyAPI).

В браузерах, не поддерживающих сервис-воркеры, приложение так же должно корректно работать, 
за исключением возможности работы в оффлайне.

## Структура проекта

  * `gifs.html` – точка входа
  * `assets` – статические файлы проекта
  * `vendor` –  статические файлы внешних библиотек
  * `service-worker.js` – скрипт сервис-воркера

Открывать `gifs.html` нужно с помощью локального веб-сервера – не как файл. 
Это можно сделать с помощью встроенного в WebStorm/Idea веб-сервера, с помощью простого сервера
из состава PHP или Python. Можно воспользоваться и любым другим способом.



# Решение
Раньше я лишь мельком читал статьи на хабре о service workers и о кешировании, поэтому скажу сразу, я уверен, что все намного сложнее, чем я думаю!

- Запустил приложение в WebStorm
- Открыл в Google Chrome
- *я еще пока не знаю, как работают SW на самом деле, как страница с ним общается*
- Вчитывался в задание очень много раз, но в чем именно заключается баг так и не понял однозначно.  
- Предположил, что под "перестал обрабатывать запросы за ресурсами приложения", это внешние ресурсы, т.е. гифки.

Далее, попытка воспроизвести баг и как-то его классифицировать, чтобы понять, как его исправить, но...:
- Нахожу гифки
- Добавляю парочку в избранное
- Кликаю Избранное
- Открывается окошко, а в нем появились добавленные мной гифки
- хм...
- Отключаю интернет
- кликаю по Избранное, полагая, что гифки оттуда исчезнут
- но они отобразились (но, были плитки с битыми картинками)
- Жму Ф5
- Открываю Избранное, плитки с битыми картинками снова там
- Открываю в Dev-tools пункт Cache storage, но он пуст! Но в Indexed DB ключи избранных гифок естественно были.
- Начал досконально изучать код воркера, было сложно и непонятно, особенно было непонятно, почему консолька ничего не выдает из воркера, намучился и так и сяк...
- Далее от усталости предположил - что если баг заключается в том, что html страница и прочие ресурсы отдаются всегда из кеша?
- Но нет...

Изучение
- Перечитал кучу туториалов (мало информации, все одинаковые)
- Перечитав кучку, набрел на статью о том, как страница общается с воркером
- Начал искать этот механизм (обмен сообщениями) в приложении
- В воркере обнаружил обработчики
- Затем начал листать файлы в assets. Т.к. я раньше не работал с BEM инструментами, то пришлось листать каждый js файл. 
- Бизнес-логику проследил, нашел реализацию хелпера для работы с воркером в blocks.js
- Затем в favorites-controller отследил, как он декорирует методы хелпера
- Затем пришлось поизучать, как дебажить воркеры, узнал о том, как в хроме просмотреть все воркеры и лог сообщений
- Попытался залогировать работу воркера и посмотреть в логе в chrome://serviceworker-internals/ но там было только про Installed/activated
- Никак не мог добиться того, чтобы в консольке показалось мое сообщение из воркера (разместил я его в обработчике на сообщение favorite:add)
- Стал перечитывать туториалы
- Нашел очень важный момент, связанный со областью выполнения воркера (scope)
- Т.к. я уже практически знал каждую строчку кода в blocks.js / service-worker.js, то предположил:
- **Что если баг заключается в том, что гифки не попадают в app cache потому что serviceWorker работает в области, отличной от gifs.html? (на это косвенно указывал рефакторинг связанный с красивым расположением файлов)**

Решение (но не уверен, что это оно)
- В методе регистрации, сначала попытался указать вторым параметром {scope:"/"}, ясное дело, это не помогло, вылетало исключение.
- Тогда перенес service-worker.js рядом с gifs.html (да так, чтобы воркер работал в области всех файлов статики и vendor и assets)
- Запустил приложение. Очистил кеш/хранилища, отцепил старый воркер, для уверенности ctrl+f5
- F5
- Консоль ожила! 
- Теперь в консоли можно было увидеть сообщения о добавлении в избранное (те, которые воркер обработал)
- Кроме того, гифки (сами картинки, не только ключики) стали попадать в кеш
- При выключенном интернете, в избранном картинки также отображались.

Не знаю, в этом ли заключается решение, но serviceWorkers - это очень круто!




## Ответы на вопросы:
**Вопрос №1:** зачем нужен этот вызов?
`.then(() => self.skipWaiting())`
**Ответ:** 
Этот метот позволит "насильно" устанавливить текущий воркер,
не дожидаясь пока не будут закрыты (или обновлены) страницы, на которых уже работает старый воркер.
Вызов этого метода приведет к вызову события onactivate
 
 
**Вопрос №2:** зачем нужен этот вызов?
`self.clients.claim();`
**Ответ:** 
Позволяет установить воркер как активный (активировать) на всех открытых
страницах того же scope'а (в котором serviceworker) без переоткрытия/перезагрузки страницы


**Вопрос №3:** для всех ли случаев подойдёт такое построение ключа?
```javascript
const url = new URL(event.request.url);
const cacheKey = url.origin + url.pathname;
...
caches.match(cacheKey)
```
**Ответ:** 
Ответа точного и однозначного не знаю, но предполагаю, что это связано с заголовками (или др. параметрами request'а), ни в одном примере не нашел такого подхода, везде ключом является event.request

**Вопрос №4**: зачем нужна эта цепочка вызовов?
```javascript
return Promise.all(
    names.filter(name => name !== CACHE_VERSION)
        .map(name => {
            console.log('[ServiceWorker] Deleting obsolete cache:', name);
            return caches.delete(name);
        })
);
```
**Ответ:**
Удалить старый кеш (старый - это отличный от текущей версии)


**Вопрос №5**: для чего нужно клонирование?
`cache.put(cacheKey, response.clone());`

Опираясь только на то, что написано тут
https://developer.mozilla.org/ru/docs/Web/API/Service_Worker_API/Using_Service_Workers

Выдержка из туториала:
`Клон помещается в кеш, а оригинальный ответ передается браузеру, который передает его странице,
которая запросила ресурс.
Почему? Потому, что потоки запроса и ответа могут быть прочитаны только единожды. Чтобы ответ был
получен браузером и сохранен в кеше — нам нужно клонировать его. Так, оригинальный объект
отправится браузеру, а клон будет закеширован. Оба они будут прочитаны единожды.`

Честно, этот момент я не совсем понял, т.к. пробовал читать response перед клонированием, но
никаких исключительных ситуаций не происходило

                    

## Дополнительное задание
`Реализуйте возможность переключения в офлайн-режим после первого же запроса, а не после второго, как это происходило в работающем приложении до всех рефакторингов.`

В процессе...
