import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1752348335890 implements MigrationInterface {
    name = 'InitSchema1752348335890'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "confirmation_types" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "antagonist_name" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "direction_id" uuid, CONSTRAINT "PK_ba7722970409d36d858254bfb17" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "directions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_a6080721aab2adea433a8b8fde4" UNIQUE ("name"), CONSTRAINT "PK_f619ca47644a835bd091e8b9814" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "positions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "amount" double precision NOT NULL, "entry_price" double precision NOT NULL, "opened_at" TIMESTAMP NOT NULL DEFAULT now(), "last_updated" TIMESTAMP NOT NULL DEFAULT now(), "symbol_id" uuid, "direction_id" uuid, CONSTRAINT "PK_17e4e62ccd5749b289ae3fae6f3" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "symbols" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_4d4e1e1ebf1b6c737668baff7cb" UNIQUE ("name"), CONSTRAINT "PK_f9967bf9e35433b0a81ad95f8bf" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "confirmations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "price" double precision NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "symbol_id" uuid, "timeframe_id" uuid, "type_id" uuid, CONSTRAINT "PK_8a3991e9a203e6460dcb9048746" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "timeframes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_8fa535701f97b70c2b7e4923f9a" UNIQUE ("name"), CONSTRAINT "PK_93287fe0e7cd4f7d0c4dab6f146" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "confirmation_types" ADD CONSTRAINT "FK_b73e5aa717f6286338aa7358a7d" FOREIGN KEY ("direction_id") REFERENCES "directions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "positions" ADD CONSTRAINT "FK_dca40af9b6d18a32dc5ddf08e6a" FOREIGN KEY ("symbol_id") REFERENCES "symbols"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "positions" ADD CONSTRAINT "FK_ae11237d58b9bacbd2fdb443945" FOREIGN KEY ("direction_id") REFERENCES "directions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "confirmations" ADD CONSTRAINT "FK_446e43c473c20e2ab6ebd51d055" FOREIGN KEY ("symbol_id") REFERENCES "symbols"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "confirmations" ADD CONSTRAINT "FK_78238126c34522ade5a2c01aff8" FOREIGN KEY ("timeframe_id") REFERENCES "timeframes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "confirmations" ADD CONSTRAINT "FK_af6a545cdd6c4775687299d0de0" FOREIGN KEY ("type_id") REFERENCES "confirmation_types"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "confirmations" DROP CONSTRAINT "FK_af6a545cdd6c4775687299d0de0"`);
        await queryRunner.query(`ALTER TABLE "confirmations" DROP CONSTRAINT "FK_78238126c34522ade5a2c01aff8"`);
        await queryRunner.query(`ALTER TABLE "confirmations" DROP CONSTRAINT "FK_446e43c473c20e2ab6ebd51d055"`);
        await queryRunner.query(`ALTER TABLE "positions" DROP CONSTRAINT "FK_ae11237d58b9bacbd2fdb443945"`);
        await queryRunner.query(`ALTER TABLE "positions" DROP CONSTRAINT "FK_dca40af9b6d18a32dc5ddf08e6a"`);
        await queryRunner.query(`ALTER TABLE "confirmation_types" DROP CONSTRAINT "FK_b73e5aa717f6286338aa7358a7d"`);
        await queryRunner.query(`DROP TABLE "timeframes"`);
        await queryRunner.query(`DROP TABLE "confirmations"`);
        await queryRunner.query(`DROP TABLE "symbols"`);
        await queryRunner.query(`DROP TABLE "positions"`);
        await queryRunner.query(`DROP TABLE "directions"`);
        await queryRunner.query(`DROP TABLE "confirmation_types"`);
    }

}
