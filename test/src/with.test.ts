import {
  BUILT_IN_DIALECTS,
  clearDatabase,
  destroyTest,
  initTest,
  insertPersons,
  TestContext,
  testSql,
  expect,
} from './test-setup.js'

for (const dialect of BUILT_IN_DIALECTS) {
  describe(`${dialect}: with`, () => {
    let ctx: TestContext

    before(async () => {
      ctx = await initTest(dialect)
    })

    beforeEach(async () => {
      await insertPersons(ctx, [
        {
          first_name: 'Jennifer',
          last_name: 'Aniston',
          gender: 'female',
          pets: [{ name: 'Catto', species: 'cat' }],
        },
        {
          first_name: 'Arnold',
          last_name: 'Schwarzenegger',
          gender: 'male',
          pets: [{ name: 'Doggo', species: 'dog' }],
        },
        {
          first_name: 'Sylvester',
          last_name: 'Stallone',
          gender: 'male',
          pets: [{ name: 'Hammo', species: 'hamster' }],
        },
      ])
    })

    afterEach(async () => {
      await clearDatabase(ctx)
    })

    after(async () => {
      await destroyTest(ctx)
    })

    it('should create a select query with common table expressions', async () => {
      const query = ctx.db
        .with('jennifer_and_sylvester', (db) =>
          db
            .selectFrom('person')
            .where('first_name', '=', 'Jennifer')
            .orWhere('first_name', '=', 'Sylvester')
            .select(['id', 'first_name', 'gender'])
        )
        .with('arnold', (db) =>
          db
            .selectFrom('jennifer_and_sylvester')
            .where('gender', '=', 'male')
            .selectAll()
        )
        .selectFrom('arnold')
        .selectAll()

      testSql(query, dialect, {
        postgres: {
          sql: 'with "jennifer_and_sylvester" as (select "id", "first_name", "gender" from "person" where "first_name" = $1 or "first_name" = $2), "arnold" as (select * from "jennifer_and_sylvester" where "gender" = $3) select * from "arnold"',
          bindings: ['Jennifer', 'Sylvester', 'male'],
        },
      })

      const result = await query.execute()
      expect(result).to.have.length(1)
      expect(Object.keys(result[0]).sort()).to.eql([
        'first_name',
        'gender',
        'id',
      ])
      expect(result[0]).to.containSubset({
        first_name: 'Sylvester',
        gender: 'male',
      })
    })

    if (dialect === 'postgres') {
      it('should create a with query where CTEs are inserts updates and deletes', async () => {
        const query = ctx.db
          .with('deleted_arnold', (db) =>
            db
              .deleteFrom('person')
              .where('first_name', '=', 'Arnold')
              .returning('first_name as deleted_first_name')
          )
          .with('inserted_matt', (db) =>
            db
              .insertInto('person')
              .values({
                id: ctx.db.generated,
                first_name: 'Matt',
                last_name: 'Damon',
                gender: 'male',
              })
              .returning('first_name as inserted_first_name')
          )
          .with('updated_jennifer', (db) =>
            db
              .updateTable('person')
              .where('first_name', '=', 'Jennifer')
              .set({ last_name: 'Lawrence' })
              .returning('first_name as updated_first_name')
          )
          .selectFrom('deleted_arnold')
          .innerJoin('inserted_matt', (join) =>
            join.on(ctx.db.raw('1'), '=', ctx.db.raw('1'))
          )
          .innerJoin('updated_jennifer', (join) =>
            join.on(ctx.db.raw('1'), '=', ctx.db.raw('1'))
          )
          .selectAll()

        testSql(query, dialect, {
          postgres: {
            sql: 'with "deleted_arnold" as (delete from "person" where "first_name" = $1 returning "first_name" as "deleted_first_name"), "inserted_matt" as (insert into "person" ("first_name", "last_name", "gender") values ($2, $3, $4) returning "first_name" as "inserted_first_name"), "updated_jennifer" as (update "person" set "last_name" = $5 where "first_name" = $6 returning "first_name" as "updated_first_name") select * from "deleted_arnold" inner join "inserted_matt" on 1 = 1 inner join "updated_jennifer" on 1 = 1',
            bindings: [
              'Arnold',
              'Matt',
              'Damon',
              'male',
              'Lawrence',
              'Jennifer',
            ],
          },
        })

        const result = await query.execute()
        expect(result).to.have.length(1)
        expect(result[0]).to.eql({
          deleted_first_name: 'Arnold',
          inserted_first_name: 'Matt',
          updated_first_name: 'Jennifer',
        })
      })
    }
  })
}
