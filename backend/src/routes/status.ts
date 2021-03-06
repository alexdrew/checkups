import { db, query } from '../db';
import { BadRequest, Unauthorized } from '../errors';
import { assertAuthenticated } from '../session';

const MAX_INT_64 = 2147483647

export async function index () {
    assertAuthenticated();

    const {
        checkupId,
        beforeId = MAX_INT_64,
        afterId = 0,
        offset = 0,
        limit = 20,
    } = req.query as any;

    if (!checkupId) throw new BadRequest();

    const checkIsOwnerRows = await query`
        select * from "checkups"
        where id=${checkupId} and "userId"=${req.userId}
    `;
    if (checkIsOwnerRows.length === 0) throw new Unauthorized();

    const baseQuery = query`
        select * from "checkupStatuses"
        where "checkupId"=${checkupId}
    `;

    const getStatuses$ = query`
        select * from (${baseQuery}) q
        where q.id < ${beforeId} and q.id > ${afterId}
        order by "dueAt" desc
        limit ${db.raw(limit)} offset ${offset}
    `;
    const getTotalCount$ = query`
        select count(*) from (${baseQuery}) q
    `;
    const getFirstAndLast$ = query`
        (select id from (${baseQuery}) q order by "dueAt" desc limit 1)
        union
        (select id from (${baseQuery}) q order by "dueAt" asc limit 1)
    `;

    const [
        statuses,
        [ { count } ],
        [ first, last ],
    ] = await Promise.all([
        getStatuses$,
        getTotalCount$,
        getFirstAndLast$,
    ]);

    res.headers['x-total-count'] = count;

    if (statuses.length > 0) {
        if (statuses[statuses.length - 1].id > first.id) {
            res.headers['x-next-page'] = `?beforeId=${statuses[statuses.length - 1].id}`;
        }

        if (statuses[0].id < last.id) {
            res.headers['x-prev-page'] = `?after=${statuses[0].id}`;
        }
    }

    res.send({
        json: statuses.map(({ userId, ...row }) => row),
    });
}
