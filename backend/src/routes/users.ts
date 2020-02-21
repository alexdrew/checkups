import * as bcrypt from 'bcrypt';

import { query } from '../db';
import { isEmail } from '../util';
import { log } from '../log';

function assertPayload (payload): asserts payload is { email?: string; newPassword?: string; password: string } {
    if (typeof payload.password !== 'string')                   throw new Error('Bad Request');

    if (payload.email && !isEmail(payload.email))               throw new Error('Bad Request');
    if (payload.newPassword && payload.newPassword.length < 10) throw new Error('Bad Request');

    if (payload.newPassword && payload.email)                   throw new Error('Bad Request');
    if (!payload.newPassword && !payload.email)                 throw new Error('Bad Request');
}

export async function update () {
    if (!req.isAuthenticated) throw new Error('Unauthorized');

    const payload = req.json;
    assertPayload(payload);

    const [ user ] = await query`
        select * from users where id=${req.userId}
    `;

    const match = await bcrypt.compare(
        payload.password,
        user.passwordHash
    );

    if (!match) throw new Error('Unauthorized');

    if (payload.email) {
        log({
            message: "updating email",
            userId: user.id,
            oldEmail: user.email,
            newEmail: payload.email
        });
        await query`
            update users
            set email=${payload.email}
            where id=${req.userId}
        `;

        return res.send({ });
    }

    if (payload.newPassword) {
        log({
            message: "updating password",
            userId: user.id,
        });
        const passwordHash = await bcrypt.hash(
            payload.newPassword,
            14
        );
        await query`
            update users
            set "passwordHash"=${passwordHash}
            where id=${req.userId}
        `;

        return res.send({ });
    }
}