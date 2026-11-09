import { defineSeed } from '@nocobase/db';
import { encodeAuthorizationTitle } from '@nocobase/authorization/core';

/**
 * Creates the five NocoEdu permission sets once. A set that already exists is left alone, so later edits made in
 * the permission pages are kept. Nothing here assigns a set to a user or to everybody.
 *
 * The grants are written out literally because a seed is loaded on its own and must not import application code.
 * They are generated from `database/seed-data/edu-permission-sets.ts`; `tests/server/edu-permission-sets.test.ts`
 * fails when the two drift apart.
 */
const PERMISSION_SETS: readonly {
  key: string;
  title: string;
  grants: readonly object[];
}[] = [
  {
    "key": "edu_quan_tri",
    "title": "NocoEdu - Quản trị",
    "grants": [
      {
        "resource": {
          "type": "page",
          "id": "edu.home"
        },
        "actions": [
          {
            "action": "access"
          }
        ]
      },
      {
        "resource": {
          "type": "page",
          "id": "edu.coSo"
        },
        "actions": [
          {
            "action": "access"
          }
        ]
      },
      {
        "resource": {
          "type": "page",
          "id": "edu.lop"
        },
        "actions": [
          {
            "action": "access"
          }
        ]
      },
      {
        "resource": {
          "type": "page",
          "id": "edu.hocVien"
        },
        "actions": [
          {
            "action": "access"
          }
        ]
      },
      {
        "resource": {
          "type": "page",
          "id": "edu.phuHuynh"
        },
        "actions": [
          {
            "action": "access"
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.coSo"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "allRecords"
              }
            }
          },
          {
            "action": "manage",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "allRecords"
              }
            }
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.coSoQuanLy"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "allRecords"
              }
            }
          },
          {
            "action": "manage",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "allRecords"
              }
            }
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.lop"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "allRecords"
              }
            }
          },
          {
            "action": "manage",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "allRecords"
              }
            }
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.lopLich"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "allRecords"
              }
            }
          },
          {
            "action": "manage",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "allRecords"
              }
            }
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.hocVien"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "allRecords"
              }
            }
          },
          {
            "action": "manage",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "allRecords"
              }
            }
          },
          {
            "action": "updateNote",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "allRecords"
              }
            }
          },
          {
            "action": "levelUp",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "allRecords",
                "history": "allRecords"
              }
            }
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.phuHuynh"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "allRecords"
              }
            }
          },
          {
            "action": "manage",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "allRecords"
              }
            }
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.lienKet"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "allRecords"
              }
            }
          },
          {
            "action": "manage",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "allRecords"
              }
            }
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.dongY"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "allRecords"
              }
            }
          },
          {
            "action": "record",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "allRecords"
              }
            }
          }
        ]
      }
    ]
  },
  {
    "key": "edu_quan_ly_co_so",
    "title": "NocoEdu - Quản lý cơ sở",
    "grants": [
      {
        "resource": {
          "type": "page",
          "id": "edu.home"
        },
        "actions": [
          {
            "action": "access"
          }
        ]
      },
      {
        "resource": {
          "type": "page",
          "id": "edu.coSo"
        },
        "actions": [
          {
            "action": "access"
          }
        ]
      },
      {
        "resource": {
          "type": "page",
          "id": "edu.lop"
        },
        "actions": [
          {
            "action": "access"
          }
        ]
      },
      {
        "resource": {
          "type": "page",
          "id": "edu.hocVien"
        },
        "actions": [
          {
            "action": "access"
          }
        ]
      },
      {
        "resource": {
          "type": "page",
          "id": "edu.phuHuynh"
        },
        "actions": [
          {
            "action": "access"
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.coSo"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "edu.myBranches"
              }
            }
          },
          {
            "action": "manage",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "edu.myBranches"
              }
            }
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.lop"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "edu.myBranches"
              }
            }
          },
          {
            "action": "manage",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "edu.myBranches"
              }
            }
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.lopLich"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "edu.myBranches"
              }
            }
          },
          {
            "action": "manage",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "edu.myBranches"
              }
            }
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.hocVien"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "edu.myBranches"
              }
            }
          },
          {
            "action": "manage",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "edu.myBranches"
              }
            }
          },
          {
            "action": "updateNote",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "edu.myBranches"
              }
            }
          },
          {
            "action": "levelUp",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "edu.myBranches",
                "history": "edu.myBranches"
              }
            }
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.phuHuynh"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "edu.myBranches"
              }
            }
          },
          {
            "action": "manage",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "edu.myBranches"
              }
            }
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.lienKet"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "edu.myBranches"
              }
            }
          },
          {
            "action": "manage",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "edu.myBranches"
              }
            }
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.dongY"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "edu.myBranches"
              }
            }
          },
          {
            "action": "record",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "edu.myBranches"
              }
            }
          }
        ]
      }
    ]
  },
  {
    "key": "edu_hlv",
    "title": "NocoEdu - Huấn luyện viên",
    "grants": [
      {
        "resource": {
          "type": "page",
          "id": "edu.home"
        },
        "actions": [
          {
            "action": "access"
          }
        ]
      },
      {
        "resource": {
          "type": "page",
          "id": "edu.lop"
        },
        "actions": [
          {
            "action": "access"
          }
        ]
      },
      {
        "resource": {
          "type": "page",
          "id": "edu.hocVien"
        },
        "actions": [
          {
            "action": "access"
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.coSo"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "edu.myClasses"
              }
            }
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.lop"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "edu.myClasses"
              }
            }
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.lopLich"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "edu.myClasses"
              }
            }
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.hocVien"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "edu.myClasses"
              }
            }
          },
          {
            "action": "updateNote",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "edu.myClasses"
              }
            }
          },
          {
            "action": "levelUp",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "edu.myClasses",
                "history": "edu.myClasses"
              }
            }
          }
        ]
      }
    ]
  },
  {
    "key": "edu_ke_toan",
    "title": "NocoEdu - Kế toán",
    "grants": [
      {
        "resource": {
          "type": "page",
          "id": "edu.home"
        },
        "actions": [
          {
            "action": "access"
          }
        ]
      },
      {
        "resource": {
          "type": "page",
          "id": "edu.coSo"
        },
        "actions": [
          {
            "action": "access"
          }
        ]
      },
      {
        "resource": {
          "type": "page",
          "id": "edu.lop"
        },
        "actions": [
          {
            "action": "access"
          }
        ]
      },
      {
        "resource": {
          "type": "page",
          "id": "edu.hocVien"
        },
        "actions": [
          {
            "action": "access"
          }
        ]
      },
      {
        "resource": {
          "type": "page",
          "id": "edu.phuHuynh"
        },
        "actions": [
          {
            "action": "access"
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.coSo"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "allRecords"
              }
            }
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.lop"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "allRecords"
              }
            }
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.lopLich"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "allRecords"
              }
            }
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.hocVien"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "allRecords"
              }
            }
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.phuHuynh"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "allRecords"
              }
            }
          }
        ]
      },
      {
        "resource": {
          "type": "composite",
          "id": "edu.lienKet"
        },
        "actions": [
          {
            "action": "view",
            "policy": {
              "type": "composite",
              "scopes": {
                "data": "allRecords"
              }
            }
          }
        ]
      }
    ]
  },
  {
    "key": "edu_api_doc",
    "title": "NocoEdu - API chỉ đọc cho ứng dụng khác",
    "grants": [
      {
        "resource": {
          "type": "composite",
          "id": "edu.ext"
        },
        "actions": [
          {
            "action": "readStudents",
            "policy": {
              "type": "composite",
              "scopes": {
                "student": "allRecords",
                "class": "allRecords"
              }
            }
          },
          {
            "action": "readParents",
            "policy": {
              "type": "composite",
              "scopes": {
                "parent": "allRecords"
              }
            }
          }
        ]
      }
    ]
  }
];

export default defineSeed({
  name: '202611090002_edu_permission_sets',
  transaction: true,
  async run({ query }) {
    for (const set of PERMISSION_SETS) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('id')
        .where('key', '=', set.key)
        .executeTakeFirst();
      if (existing) continue;
      const now = new Date();
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: set.key,
          key: set.key,
          title: encodeAuthorizationTitle(set.title),
          grants: JSON.stringify(set.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
