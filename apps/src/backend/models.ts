import { Sequelize, DataTypes, Model } from 'sequelize';

class DbModel extends Model {
    static _columns: any;

    get print() {
        return this.toJSON();
    }

    static register(db: Sequelize) {
        super.init( this._columns, { sequelize: db });
    }
}

export class Profile extends DbModel {
    declare id: number;
    declare userName: string;
    declare name: string;
    declare isAdmin: boolean;

    static _columns = {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        userName: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        isAdmin: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        }
    }

    getDetails() {
        return {
            id: this.id,
            userName: this.userName,
            name: this.name,
        }
    }

    static async createProfile(userName: string, name: string) {
        return await Profile.create({ userName, name });
    }
}

export function initModels(db: Sequelize) {
    Profile.register(db);
}
