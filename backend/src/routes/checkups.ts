import { parseExpression } from 'cron-parser';

import { query } from '../db';
import { assertAuthenticated } from '../session';
import { groupBy } from '../util';
import { BadRequest, Unauthorized, NotFound } from '../errors';
import {randomBytes} from 'crypto';

function assertIndexQuery (query): asserts query is {
    type: 'inbound' | 'outbound';
} {
    const conditions = [
        ['inbound', 'outbound'].includes(query['type'])
    ];

    if (false === conditions.every(Boolean)) throw new BadRequest();
}

export async function index () {
    assertAuthenticated();
    assertIndexQuery(req.query);

    const checkups = await query`
        select * from "checkups"
        where "userId"=${req.userId} and type=${req.query.type}
        order by id desc
    `;

    const statuses = await query`
        select * from "checkupStatusesByAge"
        where age <= 5 and "checkupId"=any(${checkups.map(v => v.id)})
    `;

    const statusesGroupedByCheckup = groupBy(statuses, v => v.checkupId);

    for (const checkup of checkups) {
        Object.assign(checkup, { recentStatuses: statusesGroupedByCheckup[checkup.id] || [] });
    }

    res.send({ json: checkups });
}

function assertCreatePayload (payload): asserts payload is {
    url?: string;
    description?: string;
    crontab: string;
    type: 'outbound';
} {
    const outboundConditions = [
        typeof payload['url'] === 'string',
        typeof payload['crontab'] === 'string',
        payload['type'] === 'outbound',
    ];
    const inboundConditions = [
        typeof payload['description'] === 'string',
        typeof payload['crontab'] === 'string',
        payload['type'] === 'inbound',
    ];

    if (outboundConditions.every(Boolean) || inboundConditions.every(Boolean)) {
        return;
    }

    throw new BadRequest();
}

export async function create () {
    assertAuthenticated();
    assertCreatePayload(req.json);

    const { type, url, description, crontab } = req.json;
    const nextRunDueAt     = parseExpression(crontab).next().toISOString();

    if (type === 'outbound') {
        const [ checkup ] = await query`
            insert into "checkups"(type, url, crontab, "nextRunDueAt", "userId")
            values (${type}, ${url}, ${crontab}, ${nextRunDueAt}, ${req.userId})
            returning *
        `;
        res.send({ status: 201, json: checkup });
    } else if (type === 'inbound') {
        const token = randomBytes(128).toString('hex');
        const [ checkup ] = await query`
            insert into "checkups"(type, token, description, crontab, "nextRunDueAt", "userId")
            values (${type}, ${token}, ${description}, ${crontab}, ${nextRunDueAt}, ${req.userId})
            returning *
        `;
        res.send({ status: 201, json: checkup });
    } else {
        throw new Error('Not Implemented');
    }
};


export async function show (id : string) {
    assertAuthenticated();

    const [ checkup ] = await query`
        select * from "checkups"
        where id=${id}
    `;

    if (!checkup)                      throw new NotFound();
    if (checkup.userId !== req.userId) throw new Unauthorized();

    const recentStatuses = await query`
        select * from "checkupStatusesByAge"
        where age <= 5 and "checkupId"=${id}
    `;

    Object.assign(checkup, { recentStatuses });

    res.send({ json: checkup });
};
